'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, Dumbbell, Pencil, Timer } from 'lucide-react';
import { PlateCalculatorModal } from '@/components/plate-calculator-modal';
import { RestTimerModal } from '@/components/rest-timer-modal';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';
import { convertWeight, roundTo, type WeightUnit } from '@/lib/units/conversion';
import {
  acknowledgeSetMutationFields,
  cacheWorkoutDay,
  enqueueSetMutation,
  flushOfflineMutationQueue,
  getCachedWorkoutDay,
  patchCachedSetsInDay,
} from '@/lib/offline-queue';

const SHARED_EXERCISE_TITLE_KEY = 'shared-exercise-title-transition';
const KG_PLATE_OPTIONS = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
const FEELING_OPTIONS = [
  { emoji: '😩', label: 'Cansado', score: 1 },
  { emoji: '😑', label: 'Regular', score: 3 },
  { emoji: '💪', label: 'Bien', score: 5 },
] as const;

interface Set {
  id: string;
  sessionId: string;
  liftId: 'SQ' | 'DL' | 'BP' | null;
  setNumber: number;
  repsTarget: number;
  targetWeight: number;
  unit: string;
  isDone: boolean;
  setFeelingScore: number | null;
  rpe: number | null;
  rir: number | null;
  exercise: {
    id: string;
    name: string;
  };
}

interface SessionWithSets {
  sets: Set[];
}

type SetServerSnapshot = Pick<Set, 'repsTarget' | 'targetWeight' | 'setFeelingScore' | 'rpe' | 'rir' | 'isDone'>;
type SetSyncState = {
  metricsQueued: boolean;
  metricsInFlight: boolean;
  doneQueued: boolean;
  doneInFlight: boolean;
};

const extractExerciseSets = (sessions: SessionWithSets[], exerciseId: string): Set[] =>
  sessions
    .flatMap((session) => session.sets)
    .filter((set) => set.exercise.id === exerciseId);

export default function ExerciseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const date = params.date as string;
  const exerciseId = params.exerciseId as string;

  const [sets, setSets] = useState<Set[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [savingSetIds, setSavingSetIds] = useState<Record<string, boolean>>({});
  const [showCalculator, setShowCalculator] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [calculatorWeight, setCalculatorWeight] = useState(0);
  const [calculatorUnit, setCalculatorUnit] = useState<'kg' | 'lb'>('kg');
  const [availablePlatesKg, setAvailablePlatesKg] = useState<number[]>([...KG_PLATE_OPTIONS]);
  const [exerciseOneRm, setExerciseOneRm] = useState<number | null>(null);
  const [exerciseLiftId, setExerciseLiftId] = useState<'SQ' | 'DL' | 'BP' | null>(null);
  const [oneRmUnit, setOneRmUnit] = useState<'kg' | 'lb' | null>(null);
  const [isTitleEntering, setIsTitleEntering] = useState(false);
  const [isMetaEntering, setIsMetaEntering] = useState(false);
  const [entryTitle, setEntryTitle] = useState<string | null>(null);
  const [entrySetCountText, setEntrySetCountText] = useState<string | null>(null);
  const [recentlyCompletedSetIds, setRecentlyCompletedSetIds] = useState<Record<string, boolean>>({});
  const [isExerciseCompletionAnimating, setIsExerciseCompletionAnimating] = useState(false);
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [editRepsTarget, setEditRepsTarget] = useState('');
  const [editTargetWeight, setEditTargetWeight] = useState('');
  const [editUnit, setEditUnit] = useState<WeightUnit>('kg');
  const [isEditSaving, setIsEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const metricsDebounceTimersRef = useRef<Record<string, number>>({});
  const completionAnimationTimersRef = useRef<Record<string, number>>({});
  const exerciseCompletionTimerRef = useRef<number | null>(null);
  const pendingMetricsUpdatesRef = useRef<
    Record<string, { sessionId: string; updates: Partial<Pick<Set, 'setFeelingScore' | 'rpe' | 'rir'>> }>
  >({});
  const doneDebounceTimersRef = useRef<Record<string, number>>({});
  const pendingDoneUpdatesRef = useRef<Record<string, { sessionId: string; isDone: boolean }>>({});
  const confirmedSetValuesRef = useRef<Record<string, SetServerSnapshot>>({});
  const setSyncStateRef = useRef<Record<string, SetSyncState>>({});

  const updateSetSyncFlag = (setId: string, flag: keyof SetSyncState, value: boolean) => {
    const current = setSyncStateRef.current[setId] ?? {
      metricsQueued: false,
      metricsInFlight: false,
      doneQueued: false,
      doneInFlight: false,
    };

    current[flag] = value;

    const isSavingSet = current.metricsQueued || current.metricsInFlight || current.doneQueued || current.doneInFlight;

    if (isSavingSet) {
      setSyncStateRef.current[setId] = current;
    } else {
      delete setSyncStateRef.current[setId];
    }

    setSavingSetIds((previous) => {
      const alreadySaving = Boolean(previous[setId]);

      if (isSavingSet && alreadySaving) {
        return previous;
      }

      if (!isSavingSet && !alreadySaving) {
        return previous;
      }

      if (isSavingSet) {
        return { ...previous, [setId]: true };
      }

      const next = { ...previous };
      delete next[setId];
      return next;
    });
  };

  const rememberConfirmedValues = (sourceSets: Set[]) => {
    sourceSets.forEach((set) => {
      confirmedSetValuesRef.current[set.id] = {
        repsTarget: set.repsTarget,
        targetWeight: set.targetWeight,
        setFeelingScore: set.setFeelingScore,
        rpe: set.rpe,
        rir: set.rir,
        isDone: set.isDone,
      };
    });
  };

  const clearExerciseProfile = useCallback(() => {
    setExerciseOneRm(null);
    setOneRmUnit(null);
  }, []);

  const loadExerciseProfile = useCallback(async (lift: 'SQ' | 'DL' | 'BP') => {
    try {
      const profileData = await fetchJsonWithInFlightDedup<{ profiles?: Array<{ liftId: string; oneRm: number; unit: string }> }>(
        '/api/training/531/profile'
      );

      const profile = (profileData.profiles ?? []).find((item) => item.liftId === lift);

      if (!profile) {
        clearExerciseProfile();
        return;
      }

      setExerciseOneRm(Number(profile.oneRm));
      setOneRmUnit(profile.unit as 'kg' | 'lb');
    } catch {
      clearExerciseProfile();
    }
  }, [clearExerciseProfile]);

  useEffect(() => {
    let cancelled = false;
    let hasCachedSets = false;

    const hydrateCachedSets = async () => {
      try {
        const cachedSessions = await getCachedWorkoutDay(date);
        if (cancelled || !cachedSessions) {
          return;
        }

        const cachedSets = extractExerciseSets(cachedSessions as SessionWithSets[], exerciseId);
        if (cachedSets.length === 0) {
          return;
        }

        hasCachedSets = true;
        setSets(cachedSets);
        rememberConfirmedValues(cachedSets);
        setLoading(false);
      } catch {
        // Ignora errores de cache local.
      }
    };

    void hydrateCachedSets();

    const hydrateProfileFromSets = (sourceSets: Set[]) => {
      const firstSet = sourceSets[0];
      if (!firstSet) {
        setExerciseLiftId(null);
        clearExerciseProfile();
        return;
      }

      setCalculatorUnit(firstSet.unit as 'kg' | 'lb');
      const firstLiftId = firstSet.liftId;
      setExerciseLiftId(firstLiftId);

      if (!firstLiftId) {
        clearExerciseProfile();
        return;
      }

      loadExerciseProfile(firstLiftId);
    };

    // Fetch en background y actualiza si hay cambios
    const fetchExerciseSets = async () => {
      setError('');

      try {
        const data = await fetchJsonWithInFlightDedup<{ sessions: SessionWithSets[] }>(`/api/workouts/by-date/${date}`);
        if (cancelled) {
          return;
        }

        const filteredSets = extractExerciseSets(data.sessions as SessionWithSets[], exerciseId);

        setSets(filteredSets);
        rememberConfirmedValues(filteredSets);
        await cacheWorkoutDay(date, data.sessions);

        hydrateProfileFromSets(filteredSets);
      } catch {
        if (!cancelled && !hasCachedSets) {
          setError('Sin internet y sin cache local para este ejercicio.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchExerciseSets();

    return () => {
      cancelled = true;
    };
  }, [date, exerciseId, loadExerciseProfile, clearExerciseProfile]);

  useEffect(() => {
    const loadPlateSettings = async () => {
      try {
        const data = await fetchJsonWithInFlightDedup<{ settings?: { availablePlatesKg?: number[] } }>('/api/user/settings');
        const availablePlates = data.settings?.availablePlatesKg;
        const fetched = Array.isArray(availablePlates)
          ? availablePlates
          : [...KG_PLATE_OPTIONS];

        setAvailablePlatesKg(KG_PLATE_OPTIONS.filter((plate) => fetched.includes(plate)));
      } catch {
        // Fallback silencioso a defaults.
      }
    };

    loadPlateSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchJsonWithInFlightDedup<{ settings?: { restTimerSeconds?: number } }>('/api/user/settings')
      .then((data) => {
        if (!cancelled && data.settings?.restTimerSeconds) {
          setRestTimerSeconds(data.settings.restTimerSeconds);
        }
      })
      .catch(() => {
        // Use default value on error
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    try {
      const rawTransitionData = sessionStorage.getItem(SHARED_EXERCISE_TITLE_KEY);
      if (!rawTransitionData) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsTitleEntering(false);
        setIsMetaEntering(false);
        return;
      }

      sessionStorage.removeItem(SHARED_EXERCISE_TITLE_KEY);
      const transitionData = JSON.parse(rawTransitionData) as {
        date: string;
        exerciseId: string;
        title: string;
        setCountText?: string;
      };

      if (transitionData.date !== date || transitionData.exerciseId !== exerciseId) {
        return;
      }

      setEntryTitle(transitionData.title);
      setEntrySetCountText(transitionData.setCountText ?? null);
      setIsTitleEntering(true);
      setIsMetaEntering(true);

      const timeoutId = globalThis.window.setTimeout(() => {
        setIsTitleEntering(false);
        setIsMetaEntering(false);
      }, 260);

      return () => {
        globalThis.window.clearTimeout(timeoutId);
        setIsTitleEntering(false);
        setIsMetaEntering(false);
      };
    } catch {
      // Ignora errores de parseo para no romper la navegacion.
      setIsTitleEntering(false);
      setIsMetaEntering(false);
    }
  }, [loading, date, exerciseId]);

  useEffect(() => {
    return () => {
      Object.values(metricsDebounceTimersRef.current).forEach((timeoutId) => {
        globalThis.window.clearTimeout(timeoutId);
      });
      Object.values(completionAnimationTimersRef.current).forEach((timeoutId) => {
        globalThis.window.clearTimeout(timeoutId);
      });
      if (exerciseCompletionTimerRef.current) {
        globalThis.window.clearTimeout(exerciseCompletionTimerRef.current);
      }
      Object.values(doneDebounceTimersRef.current).forEach((timeoutId) => {
        globalThis.window.clearTimeout(timeoutId);
      });
      metricsDebounceTimersRef.current = {};
      completionAnimationTimersRef.current = {};
      exerciseCompletionTimerRef.current = null;
      pendingMetricsUpdatesRef.current = {};
      doneDebounceTimersRef.current = {};
      pendingDoneUpdatesRef.current = {};
      confirmedSetValuesRef.current = {};
      setSyncStateRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!navigator.onLine) {
      return;
    }

    void flushOfflineMutationQueue();
  }, []);

  const flushSetMetricsUpdate = async (setId: string) => {
    const pending = pendingMetricsUpdatesRef.current[setId];
    if (!pending || Object.keys(pending.updates).length === 0) {
      return;
    }

    delete pendingMetricsUpdatesRef.current[setId];

    try {
      const res = await fetch(`/api/workouts/${pending.sessionId}/sets/${setId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.updates),
      });

      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          await enqueueSetMutation(setId, pending.sessionId, pending.updates);
          setSyncError('Sincronización pendiente. Se reintentará automáticamente.');
          return;
        }

        throw new Error('Failed to update set');
      }

      const confirmed = confirmedSetValuesRef.current[setId];
      confirmedSetValuesRef.current[setId] = {
        ...confirmed,
        ...pending.updates,
      };
      await acknowledgeSetMutationFields(
        setId,
        Object.keys(pending.updates) as Array<'setFeelingScore' | 'rpe' | 'rir'>
      );
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        await enqueueSetMutation(setId, pending.sessionId, pending.updates);
        setSyncError('Guardado offline. Se sincronizará cuando vuelva internet.');
      } else {
        console.error('Failed to update set metrics:', err);
        const confirmed = confirmedSetValuesRef.current[setId];
        if (confirmed) {
          setSets((currentSets) =>
            currentSets.map((set) =>
              set.id === setId
                ? {
                    ...set,
                    setFeelingScore: confirmed.setFeelingScore,
                    rpe: confirmed.rpe,
                    rir: confirmed.rir,
                  }
                : set
            )
          );
        }
        setSyncError('No se pudieron guardar métricas del set. Reintentá.');
      }
    } finally {
      updateSetSyncFlag(setId, 'metricsInFlight', false);
    }
  };

  const scheduleSetMetricsUpdate = (
    setId: string,
    sessionId: string,
    updates: Partial<Pick<Set, 'setFeelingScore' | 'rpe' | 'rir'>>
  ) => {
    updateSetSyncFlag(setId, 'metricsQueued', true);
    const pendingForSet = pendingMetricsUpdatesRef.current[setId];
    const mergedUpdates = pendingForSet?.updates
      ? { ...pendingForSet.updates, ...updates }
      : updates;
    pendingMetricsUpdatesRef.current[setId] = {
      sessionId,
      updates: mergedUpdates,
    };

    const existingTimer = metricsDebounceTimersRef.current[setId];
    if (existingTimer) {
      globalThis.window.clearTimeout(existingTimer);
    }

    metricsDebounceTimersRef.current[setId] = globalThis.window.setTimeout(() => {
      updateSetSyncFlag(setId, 'metricsQueued', false);
      updateSetSyncFlag(setId, 'metricsInFlight', true);
      void flushSetMetricsUpdate(setId);
      delete metricsDebounceTimersRef.current[setId];
    }, 300);
  };

  const handleSetFeelingChange = (setId: string, score: number) => {
    setSyncError('');
    const set = sets.find((item) => item.id === setId);
    if (!set) {
      return;
    }
    setSets((currentSets) =>
      currentSets.map((s) => (s.id === setId ? { ...s, setFeelingScore: score } : s))
    );
    void patchCachedSetsInDay(date, [{ id: setId, setFeelingScore: score }]);
    scheduleSetMetricsUpdate(setId, set.sessionId, { setFeelingScore: score });
  };

  const handleRirChange = (setId: string, rir: number) => {
    setSyncError('');
    const set = sets.find((item) => item.id === setId);
    if (!set) {
      return;
    }
    setSets((currentSets) => currentSets.map((s) => (s.id === setId ? { ...s, rir } : s)));
    void patchCachedSetsInDay(date, [{ id: setId, rir }]);
    scheduleSetMetricsUpdate(setId, set.sessionId, { rir });
  };

  const flushSetDoneUpdate = async (setId: string) => {
    const pending = pendingDoneUpdatesRef.current[setId];
    if (!pending) {
      return;
    }

    delete pendingDoneUpdatesRef.current[setId];

    try {
      const res = await fetch(`/api/workouts/${pending.sessionId}/sets/${setId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDone: pending.isDone }),
      });

      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          await enqueueSetMutation(setId, pending.sessionId, { isDone: pending.isDone });
          setSyncError('Sincronización pendiente. Se reintentará automáticamente.');
          return;
        }

        throw new Error('Failed to update set');
      }

      const confirmed = confirmedSetValuesRef.current[setId];
      confirmedSetValuesRef.current[setId] = {
        ...confirmed,
        isDone: pending.isDone,
      };
      await acknowledgeSetMutationFields(setId, ['isDone']);
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        await enqueueSetMutation(setId, pending.sessionId, { isDone: pending.isDone });
        setSyncError('Guardado offline. Se sincronizará cuando vuelva internet.');
      } else {
        console.error('Failed to toggle set done:', err);
        const confirmed = confirmedSetValuesRef.current[setId];
        if (confirmed) {
          setSets((currentSets) =>
            currentSets.map((set) => (set.id === setId ? { ...set, isDone: confirmed.isDone } : set))
          );
        }
        setSyncError('No se pudo guardar el estado del set. Reintentá.');
      }
    } finally {
      updateSetSyncFlag(setId, 'doneInFlight', false);
    }
  };

  const scheduleSetDoneUpdate = (setId: string, sessionId: string, isDone: boolean) => {
    updateSetSyncFlag(setId, 'doneQueued', true);
    pendingDoneUpdatesRef.current[setId] = { sessionId, isDone };

    const existingTimer = doneDebounceTimersRef.current[setId];
    if (existingTimer) {
      globalThis.window.clearTimeout(existingTimer);
    }

    doneDebounceTimersRef.current[setId] = globalThis.window.setTimeout(() => {
      updateSetSyncFlag(setId, 'doneQueued', false);
      updateSetSyncFlag(setId, 'doneInFlight', true);
      void flushSetDoneUpdate(setId);
      delete doneDebounceTimersRef.current[setId];
    }, 220);
  };

  const triggerSetCompletionAnimation = (setId: string) => {
    const existingTimer = completionAnimationTimersRef.current[setId];
    if (existingTimer) {
      globalThis.window.clearTimeout(existingTimer);
    }

    setRecentlyCompletedSetIds((previous) => ({ ...previous, [setId]: true }));

    completionAnimationTimersRef.current[setId] = globalThis.window.setTimeout(() => {
      setRecentlyCompletedSetIds((previous) => {
        const next = { ...previous };
        delete next[setId];
        return next;
      });
      delete completionAnimationTimersRef.current[setId];
    }, 1100);
  };

  const triggerExerciseCompletionAnimation = () => {
    if (exerciseCompletionTimerRef.current) {
      globalThis.window.clearTimeout(exerciseCompletionTimerRef.current);
    }

    setIsExerciseCompletionAnimating(true);

    exerciseCompletionTimerRef.current = globalThis.window.setTimeout(() => {
      setIsExerciseCompletionAnimating(false);
      exerciseCompletionTimerRef.current = null;
    }, 760);
  };

  const handleToggleDone = (setId: string) => {
    setSyncError('');
    const set = sets.find((s) => s.id === setId);
    if (!set) return;

    const nextIsDone = !set.isDone;
    const completesExercise = nextIsDone && sets.every((item) => item.id === setId || item.isDone);

    if (nextIsDone) {
      triggerSetCompletionAnimation(setId);
      if (completesExercise) {
        triggerExerciseCompletionAnimation();
      }
    }

    const nextRir = nextIsDone && set.rir === null ? 2 : set.rir;

    setSets((currentSets) =>
      currentSets.map((s) =>
        s.id === setId ? { ...s, isDone: nextIsDone, rir: nextRir } : s
      )
    );
    void patchCachedSetsInDay(date, [{ id: setId, isDone: nextIsDone, ...(nextRir !== set.rir ? { rir: nextRir } : {}) }]);
    scheduleSetDoneUpdate(setId, set.sessionId, nextIsDone);
    if (nextRir !== set.rir) {
      scheduleSetMetricsUpdate(setId, set.sessionId, { rir: nextRir });
    }
  };

  const handleOpenCalculator = (weight: number, unit: 'kg' | 'lb') => {
    setCalculatorWeight(weight);
    setCalculatorUnit(unit);
    setShowCalculator(true);
  };

  const handleOpenSetEdit = (set: Set) => {
    setEditError('');
    setEditingSetId(set.id);
    setEditRepsTarget(String(set.repsTarget));
    setEditTargetWeight(String(set.targetWeight));
    setEditUnit((set.unit === 'lb' ? 'lb' : 'kg') as WeightUnit);
  };

  const handleCloseSetEdit = () => {
    if (isEditSaving) {
      return;
    }

    setEditingSetId(null);
    setEditError('');
  };

  const handleSaveSetEdit = async () => {
    const set = sets.find((item) => item.id === editingSetId);
    if (!set) {
      return;
    }

    const nextRepsTarget = Number.parseInt(editRepsTarget, 10);
    const nextTargetWeight = Number.parseFloat(editTargetWeight);

    if (!Number.isInteger(nextRepsTarget) || nextRepsTarget < 1 || nextRepsTarget > 100) {
      setEditError('Las repeticiones deben estar entre 1 y 100.');
      return;
    }

    if (!Number.isFinite(nextTargetWeight) || nextTargetWeight <= 0) {
      setEditError('El peso debe ser mayor que 0.');
      return;
    }

    const confirmedBeforeEdit = confirmedSetValuesRef.current[set.id] ?? {
      repsTarget: set.repsTarget,
      targetWeight: set.targetWeight,
      setFeelingScore: set.setFeelingScore,
      rpe: set.rpe,
      rir: set.rir,
      isDone: set.isDone,
    };

    setEditError('');
    setIsEditSaving(true);
    setSets((currentSets) =>
      currentSets.map((currentSet) =>
        currentSet.id === set.id
          ? { ...currentSet, repsTarget: nextRepsTarget, targetWeight: nextTargetWeight }
          : currentSet
      )
    );
    void patchCachedSetsInDay(date, [
      { id: set.id, repsTarget: nextRepsTarget, targetWeight: nextTargetWeight },
    ]);

    try {
      const response = await fetch(`/api/workouts/${set.sessionId}/sets/${set.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repsTarget: nextRepsTarget,
          targetWeight: nextTargetWeight,
        }),
      });

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          await enqueueSetMutation(set.id, set.sessionId, {
            repsTarget: nextRepsTarget,
            targetWeight: nextTargetWeight,
          });
          confirmedSetValuesRef.current[set.id] = {
            ...confirmedBeforeEdit,
            repsTarget: nextRepsTarget,
            targetWeight: nextTargetWeight,
          };
          setSyncError('Guardado offline. Se sincronizará cuando vuelva internet.');
          setEditingSetId(null);
          return;
        }

        const data = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
        throw new Error(data?.detail ?? data?.error ?? 'FAILED_TO_UPDATE_SET');
      }

      confirmedSetValuesRef.current[set.id] = {
        ...confirmedBeforeEdit,
        repsTarget: nextRepsTarget,
        targetWeight: nextTargetWeight,
      };
      await acknowledgeSetMutationFields(set.id, ['repsTarget', 'targetWeight']);
      setEditingSetId(null);
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        await enqueueSetMutation(set.id, set.sessionId, {
          repsTarget: nextRepsTarget,
          targetWeight: nextTargetWeight,
        });
        confirmedSetValuesRef.current[set.id] = {
          ...confirmedBeforeEdit,
          repsTarget: nextRepsTarget,
          targetWeight: nextTargetWeight,
        };
        setSyncError('Guardado offline. Se sincronizará cuando vuelva internet.');
        setEditingSetId(null);
      } else {
        console.error('Failed to update set edit:', err);
        setSets((currentSets) =>
          currentSets.map((currentSet) =>
            currentSet.id === set.id
              ? {
                  ...currentSet,
                  repsTarget: confirmedBeforeEdit.repsTarget,
                  targetWeight: confirmedBeforeEdit.targetWeight,
                }
              : currentSet
          )
        );
        setEditError('No se pudo guardar la serie. Reintentá.');
      }
    } finally {
      setIsEditSaving(false);
    }
  };

  const renderFeelingSection = (set: Set, isNext: boolean) => {
    if (!set.isDone) {
      return (
        <p className={isNext ? 'mb-2 text-xs font-semibold text-[#101010]/80' : 'mb-2 text-xs text-gray-400'}>
          Marca este set como completado para registrar feeling y RIR.
        </p>
      );
    }

    const rirValue = set.rir ?? 2;
    const rirPct = (rirValue / 10) * 100;
    const rirFilled = isNext ? '#101010' : '#d6ff43';
    const rirTrack = isNext ? '#eaffb0' : '#1f2630';

    return (
      <div className="mb-2 space-y-4">
        <div>
          <span className={isNext ? 'block text-xs font-bold text-[#101010] mb-2' : 'block text-xs font-medium text-gray-300 mb-2'}>
            RIR: {rirValue}
          </span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={rirValue}
            onChange={(e) => handleRirChange(set.id, Number.parseInt(e.target.value, 10))}
            title={`RIR del set ${set.setNumber}`}
            aria-label={`RIR del set ${set.setNumber}`}
            className={isNext ? 'w-full h-2 appearance-none rounded-lg accent-[#101010] cursor-pointer' : 'w-full h-2 appearance-none rounded-lg accent-[#d6ff43] cursor-pointer'}
            style={{ backgroundImage: `linear-gradient(to right, ${rirFilled} 0%, ${rirFilled} ${rirPct}%, ${rirTrack} ${rirPct}%, ${rirTrack} 100%)` }}
          />
          <div className={isNext ? 'mt-1 flex justify-between text-[10px] text-[#101010]/50' : 'mt-1 flex justify-between text-[10px] text-gray-500'}>
            {Array.from({ length: 11 }, (_, i) => (
              <span key={i}>{i}</span>
            ))}
          </div>
        </div>

        <div>
          <span className={isNext ? 'block text-xs font-bold text-[#101010] mb-2' : 'block text-xs font-medium text-gray-300 mb-2'}>
            Feeling
          </span>
          <div className="grid grid-cols-3 gap-2">
            {FEELING_OPTIONS.map(({ emoji, label, score }) => {
              const selected = set.setFeelingScore === score;
              return (
                <button
                  key={score}
                  type="button"
                  onClick={() => handleSetFeelingChange(set.id, score)}
                  title={`Feeling: ${label}`}
                  aria-label={`Marcar feeling como ${label}`}
                  aria-pressed={selected}
                  className={
                    isNext
                      ? `flex flex-col items-center gap-1 rounded-xl border px-2 pt-3 pb-2 text-xs font-semibold transition-colors ${
                          selected
                            ? 'border-[#101010] bg-[#101010] text-white'
                            : 'border-[#101010]/20 text-[#101010]/70'
                        }`
                      : `flex flex-col items-center gap-1 rounded-xl border px-2 pt-3 pb-2 text-xs font-semibold transition-colors ${
                          selected
                            ? 'border-[#d6ff43] bg-[#d6ff43] text-[#101010]'
                            : 'border-white/15 text-gray-300'
                        }`
                  }
                >
                  <span className="text-xl leading-none">{emoji}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const exerciseName = sets.length > 0 ? sets[0].exercise.name : entryTitle ?? 'Ejercicio';
  const setCountText = `${sets.length} serie${sets.length > 1 ? 's' : ''}`;
  const headerSetCountText = entrySetCountText ?? setCountText;

  useEffect(() => {
    if (!syncError) {
      return;
    }

    const timeoutId = globalThis.window.setTimeout(() => {
      setSyncError('');
    }, 2400);

    return () => {
      globalThis.window.clearTimeout(timeoutId);
    };
  }, [syncError]);


  if (loading) {
    // Si no hay sets aún, muestra 3 skeletons por defecto
    const skeletonCount = sets.length > 0 ? sets.length : 3;
    return (
      <main className="app-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="mb-10 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-neutral-800 animate-pulse" />
            <div className="flex-1">
              <Skeleton className="h-10 w-40 mb-2" />
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex flex-col gap-6">
            {Array.from({ length: skeletonCount }, (_, n) => `skeleton-${n + 1}`).map((skeletonId) => (
              <div key={skeletonId} className="panel-soft p-6 min-h-30 flex flex-col gap-4">
                <Skeleton className="h-6 w-24 mb-2" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-canvas min-h-screen px-4 py-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  // Encuentra el primer set no completado (próximo a realizar)
  const nextSetIndex = sets.findIndex((set) => !set.isDone);
  const allSetsCompleted = sets.length > 0 && sets.every((set) => set.isDone);
  const editingSet = editingSetId ? sets.find((set) => set.id === editingSetId) ?? null : null;

  return (
    <main className="app-canvas min-h-screen">
      {/* Header tipo portada: sticky full-width, contenido centrado, fijo al top del viewport */}
      <div className="sticky top-0 z-30 w-full bg-[#030405]/85 backdrop-blur-sm">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-6 flex gap-4">
          <button
            onClick={() => router.back()}
            title="Volver"
            aria-label="Volver"
            className="btn-dark h-10 w-10 p-2 shrink-0"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div className="min-w-0">
            <h1
              className={`text-4xl sm:text-5xl font-heading font-black leading-tight text-white drop-shadow-md uppercase transition-all duration-300 ease-out ${isTitleEntering ? 'translate-y-10 scale-90 opacity-50' : 'translate-y-0 scale-100 opacity-100'}`}
            >
              {exerciseName}
            </h1>
            <p
              className={`mt-1 text-xs font-heading uppercase tracking-[0.2em] text-gray-300 transition-all duration-300 ease-out ${isMetaEntering ? 'translate-y-8 scale-95 opacity-40' : 'translate-y-0 scale-100 opacity-100'}`}
            >
              {headerSetCountText}
            </p>
            {exerciseOneRm !== null && oneRmUnit && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#d6ff43]/45 bg-[#d6ff43]/10 px-2.5 py-1.5 text-[#e8f8b0]">
                <Dumbbell size={14} className="text-[#d6ff43]" />
                <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                  1RM {exerciseLiftId ? `(${exerciseLiftId})` : ''}: {exerciseOneRm} {oneRmUnit}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {syncError && (
          <div className="mb-4 rounded-lg border border-amber-300/50 bg-amber-300/15 px-3 py-2 text-xs font-semibold text-amber-100">
            {syncError}
          </div>
        )}

        {/* Lista de sets tipo tarjetas */}
        <div
          className={`flex flex-col gap-6 ${
            allSetsCompleted && isExerciseCompletionAnimating ? 'exercise-complete-pop' : ''
          }`}
        >
          {sets.map((set, idx) => {
            const isNext = idx === nextSetIndex;
            const isSavingSet = Boolean(savingSetIds[set.id]);
            const isSetCompletionAnimating = Boolean(recentlyCompletedSetIds[set.id]);
            const repsTextClass =
              isNext || set.isDone
                ? 'text-3xl font-black font-heading'
                : 'text-2xl font-bold font-heading';
            return (
              <div
                key={set.id}
                className={
                  isNext
                    ? 'set-card-active-glow relative rounded-2xl bg-accent text-[#101010] shadow-lg p-6 transition-all min-h-30'
                    : 'relative panel-soft p-6 text-white min-h-30'
                }
              >
                {/* Info principal */}
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <span className="block text-xs font-heading uppercase tracking-widest opacity-70">
                      Serie {set.setNumber}
                    </span>
                    <span
                      className={`set-reps-line ${repsTextClass} ${set.isDone ? 'set-reps-line--done' : ''}`}
                    >
                      <span
                        className={`set-reps-line__label ${
                          isSetCompletionAnimating ? 'set-reps-line__label--animate' : ''
                        }`}
                      >
                        {set.repsTarget} reps @ {set.targetWeight} {set.unit}
                      </span>
                      {set.isDone && (
                        <span
                          aria-hidden="true"
                          className={`set-brush-strike ${
                            isSetCompletionAnimating ? 'set-brush-strike--animate' : 'set-brush-strike--static'
                          }`}
                        />
                      )}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleDone(set.id)}
                      title={`Marcar set ${set.setNumber} como ${set.isDone ? 'pendiente' : 'completado'}`}
                      aria-label={`Marcar set ${set.setNumber} como ${set.isDone ? 'pendiente' : 'completado'}`}
                      className={`set-status-pill ${isNext ? 'set-status-pill--next' : 'set-status-pill--base'} ${set.isDone ? 'set-status-pill--done' : 'set-status-pill--pending'}`}
                    >
                      <Dumbbell size={13} className="shrink-0" />
                      <span>{set.isDone ? 'Completado' : 'Pendiente'}</span>
                    </button>
                  </div>
                </div>

                {/* Feeling: solo despues de completar el set */}
                {renderFeelingSection(set, isNext)}

                {set.isDone && set.setFeelingScore !== null && (
                  <div className={isNext ? 'mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#101010]' : 'mt-2 flex flex-wrap gap-2 text-xs font-semibold text-gray-300'}>
                    <span className={isNext ? 'rounded-full bg-[#101010]/10 px-2 py-1' : 'rounded-full bg-white/5 px-2 py-1'}>
                      {FEELING_OPTIONS.find((o) => o.score === set.setFeelingScore)?.emoji ?? '—'} Feeling
                    </span>
                  </div>
                )}

                {/* Botón de calcular pesos */}
                <div className="mt-4 flex justify-start gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenSetEdit(set)}
                    className={`set-icon-btn ${isNext ? 'set-icon-btn--next' : 'set-icon-btn--base'}`}
                    title={`Editar serie ${set.setNumber}`}
                    aria-label={`Editar serie ${set.setNumber}`}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOpenCalculator(Number(set.targetWeight), set.unit as 'kg' | 'lb')}
                    className={`set-icon-btn ${isNext ? 'set-icon-btn--next' : 'set-icon-btn--base'}`}
                    title={`Calcular pesos para serie ${set.setNumber}`}
                    aria-label={`Calcular pesos para serie ${set.setNumber}`}
                  >
                    <Calculator size={18} />
                  </button>
                </div>

                {isSavingSet && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute bottom-3 right-3 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.95),0_0_20px_rgba(16,185,129,0.7)] animate-pulse"
                  />
                )}
              </div>
            );
          })}
        </div>

        {sets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No sets for this exercise</p>
          </div>
        )}
      </div>

      {/* Floating rest timer button */}
      <button
        type="button"
        onClick={() => setShowRestTimer(true)}
        aria-label="Iniciar timer de descanso"
        title="Timer de descanso"
        className="rest-timer-fab"
      >
        <Timer size={26} />
      </button>

      <RestTimerModal
        isOpen={showRestTimer}
        initialSeconds={restTimerSeconds}
        onClose={() => setShowRestTimer(false)}
      />

      <Modal isOpen={editingSet !== null} onClose={handleCloseSetEdit} title={editingSet ? `Editar serie ${editingSet.setNumber}` : 'Editar serie'}>
        {editingSet && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300">
              Ajustá las repeticiones o el peso objetivo de esta serie.
            </p>

            <label className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                Repeticiones
              </span>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={editRepsTarget}
                onChange={(event) => setEditRepsTarget(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition-colors placeholder:text-gray-500 focus:border-[#d6ff43]/60"
              />
            </label>

            <div className="block space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-400">
                Peso objetivo
              </span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={editTargetWeight}
                  onChange={(event) => setEditTargetWeight(event.target.value)}
                  className="flex-1 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none transition-colors placeholder:text-gray-500 focus:border-[#d6ff43]/60"
                />
                <button
                  type="button"
                  onClick={() => {
                    const nextUnit: WeightUnit = editUnit === 'kg' ? 'lb' : 'kg';
                    const current = Number.parseFloat(editTargetWeight);
                    if (Number.isFinite(current) && current > 0) {
                      setEditTargetWeight(String(roundTo(convertWeight(current, editUnit, nextUnit), 1)));
                    }
                    setEditUnit(nextUnit);
                  }}
                  className="rounded-lg border px-3 py-1 text-center text-xs font-semibold uppercase tracking-[0.12em] transition-colors border-emerald-300/60 bg-emerald-400/20 text-emerald-200 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
                >
                  {editUnit}
                </button>
              </div>
            </div>

            {editError && (
              <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {editError}
              </p>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={handleCloseSetEdit}
                disabled={isEditSaving}
                className="btn-dark px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSaveSetEdit()}
                disabled={isEditSaving}
                className="btn-accent px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isEditSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Plate Calculator Modal */}
      <PlateCalculatorModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        targetWeight={calculatorWeight}
        unit={calculatorUnit}
        availablePlatesKg={availablePlatesKg}
      />

      <style jsx global>{`
        .set-reps-line {
          position: relative;
          display: inline-flex;
          align-items: center;
          line-height: 1.05;
        }

        .set-reps-line__label {
          display: inline-block;
          transform-origin: center center;
        }

        .set-reps-line__label--animate {
          animation: set-reps-zoom-in 180ms ease-in both;
        }

        .set-reps-line--done {
          color: #ffe7e7;
        }

        .set-brush-strike {
          position: absolute;
          left: -0.08em;
          right: -0.08em;
          top: 52%;
          height: 0.56em;
          border-radius: 999px;
          pointer-events: none;
          background: linear-gradient(90deg, #a50e1b 0%, #ff384f 35%, #ff243f 65%, #9f0817 100%);
          box-shadow: 0 0 8px rgba(255, 56, 79, 0.45);
          transform-origin: left center;
          mix-blend-mode: screen;
          will-change: transform, opacity;
        }

        .set-brush-strike--animate {
          animation: brush-strike-draw 620ms cubic-bezier(0.23, 1, 0.32, 1) 150ms both;
        }

        .set-brush-strike--static {
          opacity: 0.88;
          transform: translateY(-50%) scaleX(1);
        }

        .exercise-complete-pop {
          animation: exercise-complete-pop 760ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .set-card-active-glow {
          box-shadow:
            0 0 0 1px rgba(214, 255, 67, 0.44),
            0 14px 30px rgba(214, 255, 67, 0.26),
            0 0 22px rgba(214, 255, 67, 0.42);
          animation: active-card-glow 2.4s ease-in-out infinite;
        }

        .set-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          border-radius: 999px;
          border: 1px solid;
          padding: 0.32rem 0.65rem;
          font-size: 0.75rem;
          line-height: 1;
          font-weight: 700;
          transition: background-color 150ms ease, border-color 150ms ease, transform 120ms ease;
        }

        .set-status-pill:active {
          transform: scale(0.98);
        }

        .set-status-pill--next.set-status-pill--pending {
          border-color: rgba(16, 16, 16, 0.35);
          background: rgba(255, 255, 255, 0.55);
          color: #101010;
        }

        .set-status-pill--next.set-status-pill--done {
          border-color: rgba(16, 16, 16, 0.25);
          background: rgba(16, 16, 16, 0.1);
          color: #101010;
        }

        .set-status-pill--base.set-status-pill--pending {
          border-color: rgba(255, 255, 255, 0.2);
          background: #141922;
          color: #dfe5ee;
        }

        .set-status-pill--base.set-status-pill--done {
          border-color: rgba(214, 255, 67, 0.35);
          background: rgba(214, 255, 67, 0.12);
          color: #e8f8b0;
        }

        .set-icon-btn {
          display: inline-flex;
          height: 2.4rem;
          width: 2.4rem;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          border: 1px solid;
          transition: background-color 150ms ease, border-color 150ms ease, transform 120ms ease;
        }

        .set-icon-btn:active {
          transform: scale(0.97);
        }

        .set-icon-btn--next {
          border-color: rgba(16, 16, 16, 0.2);
          background: rgba(255, 255, 255, 0.64);
          color: #101010;
        }

        .set-icon-btn--next:hover {
          background: rgba(255, 255, 255, 0.82);
        }

        .set-icon-btn--base {
          border-color: rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.08);
          color: #edf2f8;
        }

        .set-icon-btn--base:hover {
          border-color: rgba(255, 255, 255, 0.25);
          background: rgba(255, 255, 255, 0.14);
          color: #ffffff;
        }

        .rest-timer-fab {
          position: fixed;
          right: max(1rem, env(safe-area-inset-right));
          bottom: max(1rem, env(safe-area-inset-bottom));
          width: 3.75rem;
          height: 3.75rem;
          border-radius: 9999px;
          border: none;
          background: #d6ff43;
          color: #0b0b0b;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 16px 36px rgba(214, 255, 67, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.08);
          z-index: 60;
          transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
        }
        .rest-timer-fab:active {
          transform: scale(0.96);
          box-shadow: 0 10px 24px rgba(214, 255, 67, 0.18);
        }
        .rest-timer-fab svg {
          transform: translateY(-2px);
        }

        @keyframes set-reps-zoom-in {
          0% {
            transform: scale(1.22);
          }
          55% {
            transform: scale(1.04);
          }
          100% {
            transform: scale(1);
          }
        }

        @keyframes brush-strike-draw {
          0% {
            opacity: 0;
            transform: translateY(-50%) scaleX(0.08) rotate(-2deg);
          }
          40% {
            opacity: 1;
            transform: translateY(-50%) scaleX(1.04) rotate(-1deg);
          }
          70% {
            opacity: 0.96;
            transform: translateY(-50%) scaleX(0.98) rotate(-0.5deg);
          }
          100% {
            opacity: 0.88;
            transform: translateY(-50%) scaleX(1) rotate(0deg);
          }
        }

        @keyframes exercise-complete-pop {
          0% {
            transform: scale(1);
            filter: drop-shadow(0 0 0 rgba(214, 255, 67, 0));
          }
          35% {
            transform: scale(1.015);
            filter: drop-shadow(0 0 16px rgba(214, 255, 67, 0.35));
          }
          100% {
            transform: scale(1);
            filter: drop-shadow(0 0 0 rgba(214, 255, 67, 0));
          }
        }

        @keyframes active-card-glow {
          0% {
            box-shadow:
              0 0 0 1px rgba(214, 255, 67, 0.36),
              0 12px 24px rgba(214, 255, 67, 0.2),
              0 0 16px rgba(214, 255, 67, 0.28);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(214, 255, 67, 0.5),
              0 18px 34px rgba(214, 255, 67, 0.3),
              0 0 30px rgba(214, 255, 67, 0.5);
          }
          100% {
            box-shadow:
              0 0 0 1px rgba(214, 255, 67, 0.36),
              0 12px 24px rgba(214, 255, 67, 0.2),
              0 0 16px rgba(214, 255, 67, 0.28);
          }
        }
      `}</style>
    </main>
  );
}
