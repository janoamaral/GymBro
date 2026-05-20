'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, Dumbbell } from 'lucide-react';
import { PlateCalculatorModal } from '@/components/plate-calculator-modal';
import { Skeleton } from '@/components/ui/skeleton';

const SHARED_EXERCISE_TITLE_KEY = 'shared-exercise-title-transition';
const KG_PLATE_OPTIONS = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

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

type SetServerSnapshot = Pick<Set, 'setFeelingScore' | 'rpe' | 'rir' | 'isDone'>;
type SetSyncState = {
  metricsQueued: boolean;
  metricsInFlight: boolean;
  doneQueued: boolean;
  doneInFlight: boolean;
};

const WORKOUT_CACHE_KEY = 'workout-by-date-cache';
const inFlightGetRequests = new Map<string, Promise<unknown>>();

const fetchJsonWithInFlightDedup = async <T,>(url: string): Promise<T> => {
  const existingRequest = inFlightGetRequests.get(url) as Promise<T> | undefined;
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      return (await response.json()) as T;
    })
    .finally(() => {
      inFlightGetRequests.delete(url);
    });

  inFlightGetRequests.set(url, request);
  return request;
};

const getCachedExerciseSets = (date: string, exerciseId: string): Set[] => {
  if (globalThis.window === undefined) {
    return [];
  }

  try {
    const cacheRaw = localStorage.getItem(WORKOUT_CACHE_KEY);
    if (!cacheRaw) {
      return [];
    }

    const cache = JSON.parse(cacheRaw) as Record<string, SessionWithSets[]>;
    const sessions = cache[date] ?? [];
    return extractExerciseSets(sessions, exerciseId);
  } catch {
    return [];
  }
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

  const [sets, setSets] = useState<Set[]>(() => getCachedExerciseSets(date, exerciseId));
  const [loading, setLoading] = useState(() => getCachedExerciseSets(date, exerciseId).length === 0);
  const [error, setError] = useState('');
  const [syncError, setSyncError] = useState('');
  const [savingSetIds, setSavingSetIds] = useState<Record<string, boolean>>({});
  const [showCalculator, setShowCalculator] = useState(false);
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
    const cachedSets = getCachedExerciseSets(date, exerciseId);
    const hasCachedSets = cachedSets.length > 0;

    if (hasCachedSets) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSets(cachedSets);
      rememberConfirmedValues(cachedSets);
      setLoading(false);
    } else {
      setLoading(true);
    }

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
        const filteredSets = extractExerciseSets(data.sessions as SessionWithSets[], exerciseId);

        setSets(filteredSets);
        rememberConfirmedValues(filteredSets);

        // Actualiza cache
        try {
          const cacheRaw = localStorage.getItem(WORKOUT_CACHE_KEY);
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
          cache[date] = data.sessions;
          localStorage.setItem(WORKOUT_CACHE_KEY, JSON.stringify(cache));
        } catch {}

        hydrateProfileFromSets(filteredSets);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchExerciseSets();
  }, [date, exerciseId, loadExerciseProfile, clearExerciseProfile]);

  useEffect(() => {
    const loadPlateSettings = async () => {
      try {
        const data = await fetchJsonWithInFlightDedup<{ settings?: { availablePlatesKg?: number[] } }>('/api/user/settings');
        const fetched = Array.isArray(data.settings?.availablePlatesKg)
          ? (data.settings.availablePlatesKg as number[])
          : [...KG_PLATE_OPTIONS];

        setAvailablePlatesKg(KG_PLATE_OPTIONS.filter((plate) => fetched.includes(plate)));
      } catch {
        // Fallback silencioso a defaults.
      }
    };

    loadPlateSettings();
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

      if (!res.ok) throw new Error('Failed to update set');

      const confirmed = confirmedSetValuesRef.current[setId];
      confirmedSetValuesRef.current[setId] = {
        ...confirmed,
        ...pending.updates,
      };
    } catch (err) {
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
    scheduleSetMetricsUpdate(setId, set.sessionId, { setFeelingScore: score });
  };

  const handleRpeChange = (setId: string, rpe: number) => {
    setSyncError('');
    const set = sets.find((item) => item.id === setId);
    if (!set) {
      return;
    }
    setSets((currentSets) => currentSets.map((s) => (s.id === setId ? { ...s, rpe } : s)));
    scheduleSetMetricsUpdate(setId, set.sessionId, { rpe });
  };

  const handleRirChange = (setId: string, rir: number) => {
    setSyncError('');
    const set = sets.find((item) => item.id === setId);
    if (!set) {
      return;
    }
    setSets((currentSets) => currentSets.map((s) => (s.id === setId ? { ...s, rir } : s)));
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

      if (!res.ok) throw new Error('Failed to update set');

      const confirmed = confirmedSetValuesRef.current[setId];
      confirmedSetValuesRef.current[setId] = {
        ...confirmed,
        isDone: pending.isDone,
      };
    } catch (err) {
      console.error('Failed to toggle set done:', err);
      const confirmed = confirmedSetValuesRef.current[setId];
      if (confirmed) {
        setSets((currentSets) =>
          currentSets.map((set) => (set.id === setId ? { ...set, isDone: confirmed.isDone } : set))
        );
      }
      setSyncError('No se pudo guardar el estado del set. Reintentá.');
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

    setSets((currentSets) =>
      currentSets.map((s) => (s.id === setId ? { ...s, isDone: nextIsDone } : s))
    );
    scheduleSetDoneUpdate(setId, set.sessionId, nextIsDone);
  };

  const handleOpenCalculator = (weight: number, unit: 'kg' | 'lb') => {
    setCalculatorWeight(weight);
    setCalculatorUnit(unit);
    setShowCalculator(true);
  };

  const renderFeelingSection = (set: Set, isNext: boolean) => {
    if (!set.isDone) {
      return (
        <p className={isNext ? 'mb-2 text-xs font-semibold text-[#101010]/80' : 'mb-2 text-xs text-gray-400'}>
          Marca este set como completado para registrar feeling, RPE y RIR.
        </p>
      );
    }

    return (
      <div className="mb-2 space-y-4">
        <div>
          <label className={isNext ? 'block text-xs font-bold text-[#101010] mb-1' : 'block text-xs font-medium text-gray-300 mb-1'}>
            Feeling: {set.setFeelingScore ?? '—'}
          </label>
          <div className="flex items-center gap-3">
            <span className={isNext ? 'text-xs text-[#101010] w-14' : 'text-xs text-gray-400 w-14'}>Muy cansado</span>
            <input
              type="range"
              min="1"
              max="5"
              value={set.setFeelingScore ?? 3}
              onChange={(e) =>
                handleSetFeelingChange(set.id, Number.parseInt(e.target.value, 10))
              }
              title={`Sensación del set ${set.setNumber}`}
              aria-label={`Sensación del set ${set.setNumber}`}
              className={isNext ? 'flex-1 h-2 appearance-none rounded-lg bg-[#eaffb0] accent-[#101010] cursor-pointer' : 'flex-1 h-2 appearance-none rounded-lg bg-[#1f2630] accent-[#d6ff43] cursor-pointer'}
            />
            <span className={isNext ? 'text-xs text-[#101010] w-20' : 'text-xs text-gray-400 w-20'}>Lightweight 💪</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2">
            <span className={isNext ? 'text-xs font-bold text-[#101010]' : 'text-xs font-medium text-gray-300'}>
              RPE: {set.rpe ?? '—'}
            </span>
            <input
              type="range"
              min="1"
              max="10"
              value={set.rpe ?? 6}
              onChange={(e) => handleRpeChange(set.id, Number.parseInt(e.target.value, 10))}
              title={`RPE del set ${set.setNumber}`}
              aria-label={`RPE del set ${set.setNumber}`}
              className={isNext ? 'h-2 appearance-none rounded-lg bg-[#eaffb0] accent-[#101010] cursor-pointer' : 'h-2 appearance-none rounded-lg bg-[#1f2630] accent-[#d6ff43] cursor-pointer'}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={isNext ? 'text-xs font-bold text-[#101010]' : 'text-xs font-medium text-gray-300'}>
              RIR: {set.rir ?? '—'}
            </span>
            <input
              type="range"
              min="0"
              max="10"
              value={set.rir ?? 2}
              onChange={(e) => handleRirChange(set.id, Number.parseInt(e.target.value, 10))}
              title={`RIR del set ${set.setNumber}`}
              aria-label={`RIR del set ${set.setNumber}`}
              className={isNext ? 'h-2 appearance-none rounded-lg bg-[#eaffb0] accent-[#101010] cursor-pointer' : 'h-2 appearance-none rounded-lg bg-[#1f2630] accent-[#d6ff43] cursor-pointer'}
            />
          </label>
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

  return (
    <main className="app-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        {/* Header tipo portada */}
        <div className="relative mb-10 pl-14">
          <button
            onClick={() => router.back()}
            title="Volver"
            aria-label="Volver"
            className="btn-dark absolute left-0 top-1 h-10 w-10 p-2"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div>
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
                    ? 'relative rounded-2xl bg-accent text-[#101010] shadow-lg p-6 transition-all min-h-30'
                    : 'relative panel-soft p-6 text-white min-h-30'
                }
              >
                {/* Info principal */}
                <div className="flex items-center justify-between mb-2">
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
                    <input
                      type="checkbox"
                      checked={set.isDone}
                      onChange={() => handleToggleDone(set.id)}
                      title={`Marcar set ${set.setNumber} como completado`}
                      aria-label={`Marcar set ${set.setNumber} como completado`}
                      className={
                        isNext
                          ? 'w-7 h-7 rounded border-2 border-[#b6d900] checked:bg-[#101010] checked:border-[#101010] accent-[#101010] cursor-pointer'
                          : 'w-6 h-6 rounded border-2 border-gray-600 checked:bg-[#d6ff43] checked:border-[#d6ff43] cursor-pointer'
                      }
                    />
                    <span className={isNext ? 'text-xs text-[#101010] font-bold' : 'text-xs text-gray-400'}>
                      {set.isDone ? 'Completado' : 'Pendiente'}
                    </span>
                  </div>
                </div>

                {/* Feeling: solo despues de completar el set */}
                {renderFeelingSection(set, isNext)}

                {set.isDone && (
                  <div className={isNext ? 'mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#101010]' : 'mt-2 flex flex-wrap gap-2 text-xs font-semibold text-gray-300'}>
                    <span className={isNext ? 'rounded-full bg-[#101010]/10 px-2 py-1' : 'rounded-full bg-white/5 px-2 py-1'}>RPE {set.rpe ?? '—'}</span>
                    <span className={isNext ? 'rounded-full bg-[#101010]/10 px-2 py-1' : 'rounded-full bg-white/5 px-2 py-1'}>RIR {set.rir ?? '—'}</span>
                  </div>
                )}

                {/* Botón de calcular pesos */}
                <button
                  onClick={() => handleOpenCalculator(Number(set.targetWeight), set.unit as 'kg' | 'lb')}
                  className={
                    isNext
                      ? 'btn-dark flex w-full items-center justify-center gap-2 px-4 py-2 bg-[#101010] text-accent border-none font-bold mt-2'
                      : 'btn-dark flex w-full items-center justify-center gap-2 px-4 py-2 mt-2'
                  }
                >
                  <Calculator size={18} />
                  Calcular Pesos
                </button>

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
      `}</style>
    </main>
  );
}
