'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, GripVertical, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { FullscreenLoader } from '@/components/ui/fullscreen-loader';
import { ExerciseFormModal, type Exercise as PlanExercise } from '@/components/plan-wizard/exercise-form-modal';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';
import {
  cacheWorkoutDay,
  clearCachedWorkoutDay,
  enqueueAddExerciseMutation,
  enqueueDeleteExerciseMutation,
  enqueueDeleteWorkoutMutation,
  enqueueReorderMutation,
  enqueueRescheduleMutation,
  getCachedWorkoutDay,
  hasPendingMutationsForDay,
  patchCachedSetsInDay,
} from '@/lib/offline-queue';

const SHARED_EXERCISE_TITLE_KEY = 'shared-exercise-title-transition';
const TOUCH_DRAG_THRESHOLD_PX = 12;
const REORDER_PERSIST_DEBOUNCE_MS = 450;

interface Set {
  id: string;
  exerciseOrder: number;
  setNumber: number;
  repsTarget: number;
  targetWeight: number;
  unit: string;
  isDone?: boolean;
  setFeelingScore?: number | null;
  rpe?: number | null;
  rir?: number | null;
  exercise: {
    id: string;
    name: string;
  };
}

interface ExerciseGroup {
  exerciseId: string;
  exerciseName: string;
  exerciseOrder: number;
  sets: Set[];
}

interface SessionWithSets {
  id: string;
  title: string;
  startedAt: string;
  reschedule: {
    fromLocalDate: string;
    toLocalDate: string;
    reason: string | null;
    movedAt: string;
  } | null;
  sets: Set[];
}

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('es-ES', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const groupSetsByExercise = (sessions: SessionWithSets[]): ExerciseGroup[] => {
  const grouped = sessions
    .flatMap((session) => session.sets)
    .reduce<Map<string, ExerciseGroup>>((acc, set) => {
      const key = set.exercise.id;
      const currentGroup = acc.get(key) ?? {
        exerciseId: set.exercise.id,
        exerciseName: set.exercise.name,
        exerciseOrder: set.exerciseOrder,
        sets: [],
      };

      currentGroup.exerciseOrder = Math.min(currentGroup.exerciseOrder, set.exerciseOrder);
      currentGroup.sets.push(set);
      acc.set(key, currentGroup);
      return acc;
    }, new Map<string, ExerciseGroup>());

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      sets: [...group.sets].sort((a, b) => a.setNumber - b.setNumber),
    }))
    .sort((a, b) => a.exerciseOrder - b.exerciseOrder);
};

function setsEqualForDisplay(a: SessionWithSets[], b: SessionWithSets[]): boolean {
  const flatA = a.flatMap((s) => s.sets);
  const flatB = b.flatMap((s) => s.sets);
  if (flatA.length !== flatB.length) {
    return false;
  }

  const mapB = new Map(flatB.map((s) => [s.id, s]));
  for (const sa of flatA) {
    const sb = mapB.get(sa.id);
    if (!sb) {
      return false;
    }
    if (
      sa.isDone !== sb.isDone ||
      sa.repsTarget !== sb.repsTarget ||
      sa.targetWeight !== sb.targetWeight ||
      sa.setFeelingScore !== sb.setFeelingScore ||
      sa.rpe !== sb.rpe ||
      sa.rir !== sb.rir ||
      sa.exerciseOrder !== sb.exerciseOrder
    ) {
      return false;
    }
  }
  return true;
}

function reorderExerciseGroups(
  groups: ExerciseGroup[],
  fromExerciseId: string,
  toExerciseId: string,
): ExerciseGroup[] {
  const fromIndex = groups.findIndex((group) => group.exerciseId === fromExerciseId);
  const toIndex = groups.findIndex((group) => group.exerciseId === toExerciseId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return groups;
  }

  const reordered = [...groups];
  const [moved] = reordered.splice(fromIndex, 1);
  if (!moved) {
    return groups;
  }

  reordered.splice(toIndex, 0, moved);

  return reordered.map((group, index) => ({
    ...group,
    exerciseOrder: index,
  }));
}

export default function WorkoutDayPage() {
  const router = useRouter();
  const params = useParams();
  const date = params.date as string;

  const [exercises, setExercises] = useState<ExerciseGroup[]>([]);
  const [sessions, setSessions] = useState<SessionWithSets[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddExerciseModal, setShowAddExerciseModal] = useState(false);
  const [deletingExerciseId, setDeletingExerciseId] = useState<string | null>(null);
  const [showDeleteExerciseConfirm, setShowDeleteExerciseConfirm] = useState(false);
  const [deletingExercise, setDeletingExercise] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [addExerciseError, setAddExerciseError] = useState('');
  const [addingExercise, setAddingExercise] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState(() => {
    const [year, month, day] = date.split('-').map(Number);
    if (!year || !month || !day) {
      return date;
    }

    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    return formatIsoDate(nextDay);
  });
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [draggingExerciseId, setDraggingExerciseId] = useState<string | null>(null);
  const [dragOverExerciseId, setDragOverExerciseId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const skipNextExerciseOpenRef = useRef(false);
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const touchActiveExerciseIdRef = useRef<string | null>(null);
  const touchDraggingRef = useRef(false);
  const dragOriginPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragRafIdRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{ x: number; y: number } | null>(null);
  const reorderFrameRef = useRef<number | null>(null);
  const persistReorderTimeoutRef = useRef<number | null>(null);
  const latestOrderedExerciseIdsRef = useRef<string[]>([]);

  // Transicion simple: fade out al hacer click
  const [transitioning, setTransitioning] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string | null>(null);
  const [transitioningExerciseId, setTransitioningExerciseId] = useState<string | null>(null);
  const [recentlyCompletedExerciseIds, setRecentlyCompletedExerciseIds] = useState<Record<string, boolean>>({});
  const completionAnimationTimersRef = useRef<Record<string, number>>({});
  const previousExerciseCompletionRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    let hasCachedData = false;

    const hydrateFromCache = async () => {
      try {
        const cached = await getCachedWorkoutDay(date);
        if (cancelled || !cached) {
          return;
        }

        const fetchedSessions = cached as SessionWithSets[];
        hasCachedData = true;
        setSessions(fetchedSessions);
        setExercises(groupSetsByExercise(fetchedSessions));
        setLoading(false);
      } catch {
        // Ignora errores de cache para no bloquear render.
      }
    };

    void hydrateFromCache();

    // Fetch en background y actualiza si hay cambios
    const fetchSessionsForDay = async () => {
      try {
        const data = await fetchJsonWithInFlightDedup<{ sessions: SessionWithSets[] }>(
          `/api/workouts/by-date/${date}`
        );
        const fetchedSessions = data.sessions;
        if (cancelled) {
          return;
        }

        // Si hay mutaciones pendientes para este día (offline queue),
        // no pisar el estado local con el server stale.
        const cachedSessions = (await getCachedWorkoutDay(date)) as SessionWithSets[] | null;
        const currentSessionIds = (cachedSessions ?? []).map((s) => s.id);
        const currentSetIds = (cachedSessions ?? []).flatMap((s) => s.sets.map((set) => set.id));
        const hasPending = await hasPendingMutationsForDay(date, currentSessionIds, currentSetIds);
        if (hasPending) {
          return;
        }

        setSessions((prev) =>
          setsEqualForDisplay(prev, fetchedSessions) ? prev : fetchedSessions,
        );
        setExercises((prev) => {
          const next = groupSetsByExercise(fetchedSessions);
          const prevKey = prev
            .map((g) => `${g.exerciseId}:${g.exerciseOrder}:${g.sets.map((s) => `${s.id}:${s.isDone ? 1 : 0}`).join(',')}`)
            .join('|');
          const nextKey = next
            .map((g) => `${g.exerciseId}:${g.exerciseOrder}:${g.sets.map((s) => `${s.id}:${s.isDone ? 1 : 0}`).join(',')}`)
            .join('|');
          return prevKey === nextKey ? prev : next;
        });
        await cacheWorkoutDay(date, fetchedSessions);
      } catch {
        if (!cancelled && !hasCachedData) {
          setError('Sin internet y sin cache local para este día.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchSessionsForDay();

    return () => {
      cancelled = true;
    };
  }, [date]);

  useEffect(() => {
    if (!transitioning || !targetRoute) {
      return;
    }

    const timeout = setTimeout(() => {
      router.push(targetRoute);
    }, 140);

    return () => clearTimeout(timeout);
  }, [transitioning, targetRoute, router]);

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

  const clearCompletedExerciseAnimation = useCallback((exerciseId: string) => {
    setRecentlyCompletedExerciseIds((previous) => {
      const next = { ...previous };
      delete next[exerciseId];
      return next;
    });
    delete completionAnimationTimersRef.current[exerciseId];
  }, []);

  const triggerCompletedExerciseAnimation = useCallback((exerciseId: string) => {
    const existingTimer = completionAnimationTimersRef.current[exerciseId];
    if (existingTimer) {
      globalThis.window.clearTimeout(existingTimer);
    }

    setRecentlyCompletedExerciseIds((previous) => ({
      ...previous,
      [exerciseId]: true,
    }));

    completionAnimationTimersRef.current[exerciseId] = globalThis.window.setTimeout(() => {
      clearCompletedExerciseAnimation(exerciseId);
    }, 1100);
  }, [clearCompletedExerciseAnimation]);

  useEffect(() => {
    const currentCompletionState = Object.fromEntries(
      exercises.map((exerciseGroup) => [
        exerciseGroup.exerciseId,
        exerciseGroup.sets.length > 0 && exerciseGroup.sets.every((set) => Boolean(set.isDone)),
      ])
    );

    exercises.forEach((exerciseGroup) => {
      const isCompleted = currentCompletionState[exerciseGroup.exerciseId];
      const wasCompleted = previousExerciseCompletionRef.current[exerciseGroup.exerciseId] ?? false;

      if (!isCompleted || wasCompleted) {
        return;
      }

      triggerCompletedExerciseAnimation(exerciseGroup.exerciseId);
    });

    previousExerciseCompletionRef.current = currentCompletionState;
  }, [exercises, triggerCompletedExerciseAnimation]);

  useEffect(() => {
    return () => {
      if (dragRafIdRef.current !== null) {
        globalThis.window.cancelAnimationFrame(dragRafIdRef.current);
      }

      if (persistReorderTimeoutRef.current !== null) {
        globalThis.window.clearTimeout(persistReorderTimeoutRef.current);
      }

      if (reorderFrameRef.current !== null) {
        globalThis.window.cancelAnimationFrame(reorderFrameRef.current);
      }

      Object.values(completionAnimationTimersRef.current).forEach((timeoutId) => {
        globalThis.window.clearTimeout(timeoutId);
      });
      completionAnimationTimersRef.current = {};
      previousExerciseCompletionRef.current = {};
    };
  }, []);

  const [yearPart, monthPart, dayPart] = date.split('-').map(Number);
  const hasValidDateParts =
    Number.isInteger(yearPart) &&
    Number.isInteger(monthPart) &&
    Number.isInteger(dayPart) &&
    monthPart >= 1 &&
    monthPart <= 12 &&
    dayPart >= 1 &&
    dayPart <= 31;
  const displayDate = hasValidDateParts
    ? new Date(Date.UTC(yearPart, monthPart - 1, dayPart))
    : null;

  const sessionIds = sessions.map((session) => session.id);

  const rescheduledSources = Array.from(
    new Set(
      sessions
        .map((session) => session.reschedule?.fromLocalDate)
        .filter((value): value is string => Boolean(value) && value !== date)
    )
  );

  const handleDeleteWorkout = async () => {
    if (sessionIds.length === 0) {
      setShowDeleteConfirm(false);
      return;
    }

    setDeleting(true);
    setError('');

    try {
      const responses = await Promise.all(
        sessionIds.map((sessionId) =>
          fetch(`/api/workouts/${sessionId}`, {
            method: 'DELETE',
          })
        )
      );

      const hasError = responses.some((response) => !response.ok);
      if (hasError) {
        throw new Error('No se pudo eliminar el workout');
      }

      await clearCachedWorkoutDay(date);
      router.push('/');
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        await Promise.all(sessionIds.map((sessionId) => enqueueDeleteWorkoutMutation(sessionId)));
        await clearCachedWorkoutDay(date);
        router.push('/');
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleRescheduleWorkout = async () => {
    if (sessionIds.length === 0) {
      setShowRescheduleModal(false);
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(rescheduleDate)) {
      setError('Fecha inválida para reprogramar');
      return;
    }

    setRescheduling(true);
    setError('');

    try {
      const responses = await Promise.all(
        sessionIds.map((sessionId) =>
          fetch(`/api/workouts/${sessionId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              rescheduledToLocalDate: rescheduleDate,
              rescheduleReason: rescheduleReason.trim() || null,
            }),
          })
        )
      );

      const hasError = responses.some((response) => !response.ok);
      if (hasError) {
        throw new Error('No se pudo reprogramar el workout');
      }

      await clearCachedWorkoutDay(date);
      router.push(`/workout/${rescheduleDate}`);
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        await Promise.all(
          sessionIds.map((sessionId) =>
            enqueueRescheduleMutation(sessionId, rescheduleDate, rescheduleReason.trim() || null)
          )
        );
        await clearCachedWorkoutDay(date);
        router.push(`/workout/${rescheduleDate}`);
      } else {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      setRescheduling(false);
      setShowRescheduleModal(false);
    }
  };

  const handleAddExercise = async (exercise: PlanExercise) => {
    if (!exercise.sets || exercise.sets.length === 0) {
      return;
    }

    const setsPayload = exercise.sets.map((set) => {
      const targetWeight = set.bodyweight ? 0 : Number(set.weight);
      const entry: { repsTarget?: number; targetWeight: number; durationSeconds?: number; distanceMeters?: number; bodyweight?: boolean } = { targetWeight };

      if (set.bodyweight) {
        entry.bodyweight = true;
      }

      if (set.durationSeconds != null && set.durationSeconds > 0) {
        entry.durationSeconds = Number(set.durationSeconds);
      } else if (set.distanceMeters != null && Number(set.distanceMeters) > 0) {
        entry.distanceMeters = Number(set.distanceMeters);
      } else {
        entry.repsTarget = Number(set.reps ?? 1);
      }

      return entry;
    });

    const payload: { exerciseName?: string; unit: 'kg' | 'lb'; sets: typeof setsPayload } = {
      unit: exercise.unit ?? 'kg',
      sets: setsPayload,
    };

    if (exercise.name) {
      payload.exerciseName = exercise.name;
    }

    setAddExerciseError('');
    setAddingExercise(true);

    try {
      const response = await fetch(`/api/workouts/by-date/${date}/exercises`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new TypeError('retryable');
        }

        const data = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
        throw new Error(data?.detail ?? data?.error ?? 'No se pudo agregar el ejercicio');
      }

      const data = (await response.json()) as {
        sets: Array<Set & { durationSeconds?: number | null; distanceMeters?: number | null }>;
      };

      const incomingSets: Set[] = data.sets.map((s) => ({
        id: s.id,
        exerciseOrder: s.exerciseOrder,
        setNumber: s.setNumber,
        repsTarget: s.repsTarget,
        targetWeight: Number(s.targetWeight),
        unit: s.unit,
        isDone: s.isDone,
        exercise: s.exercise,
      }));

      const nextSessions = sessions.length > 0
        ? sessions.map((session, index) =>
            index === 0 ? { ...session, sets: [...session.sets, ...incomingSets] } : session,
          )
        : [
            {
              id: 'temp-session-' + date,
              title: `Workout ${date}`,
              startedAt: date,
              reschedule: null,
              sets: incomingSets,
            },
          ];

      setSessions(nextSessions);
      setExercises(groupSetsByExercise(nextSessions));
      void cacheWorkoutDay(date, nextSessions);
      setShowAddExerciseModal(false);
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        const tempExerciseId = `temp-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
        const baseOrder = exercises.length > 0 ? Math.max(...exercises.map((e) => e.exerciseOrder)) + 1 : 0;

        const provisional: Set[] = setsPayload.map((set, index) => ({
          id: `temp-${globalThis.crypto?.randomUUID?.() ?? Date.now() + index}`,
          exerciseOrder: baseOrder,
          setNumber: index + 1,
          repsTarget: set.repsTarget ?? 1,
          targetWeight: set.targetWeight,
          unit: payload.unit,
          exercise: { id: tempExerciseId, name: exercise.name },
        }));

        const nextSessions = sessions.length > 0
          ? sessions.map((session, index) =>
              index === 0 ? { ...session, sets: [...session.sets, ...provisional] } : session,
            )
          : [
              {
                id: 'temp-session-' + date,
                title: `Workout ${date}`,
                startedAt: date,
                reschedule: null,
                sets: provisional,
              },
            ];

        setSessions(nextSessions);
        setExercises(groupSetsByExercise(nextSessions));
        void cacheWorkoutDay(date, nextSessions);
        await enqueueAddExerciseMutation(date, {
          exerciseName: payload.exerciseName,
          unit: payload.unit,
          sets: setsPayload,
        } as Parameters<typeof enqueueAddExerciseMutation>[1]);
        setSyncError('Guardado offline. Se sincronizará cuando vuelva internet.');
        setShowAddExerciseModal(false);
      } else {
        setAddExerciseError(err instanceof Error ? err.message : 'No se pudo agregar el ejercicio');
      }
    } finally {
      setAddingExercise(false);
    }
  };

  const handleDeleteExercise = async () => {
    const exerciseId = deletingExerciseId;
    if (!exerciseId) {
      setShowDeleteExerciseConfirm(false);
      return;
    }

    setDeletingExercise(true);
    setSyncError('');

    try {
      const response = await fetch(
        `/api/workouts/by-date/${date}/exercises?exerciseId=${encodeURIComponent(exerciseId)}`,
        { method: 'DELETE' },
      );

      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          throw new TypeError('retryable');
        }

        const data = (await response.json().catch(() => null)) as { error?: string; detail?: string } | null;
        throw new Error(data?.detail ?? data?.error ?? 'No se pudo eliminar el ejercicio');
      }

      const nextSessions = sessions.map((session) => ({
        ...session,
        sets: session.sets.filter((set) => set.exercise.id !== exerciseId),
      }));
      setSessions(nextSessions);
      setExercises(groupSetsByExercise(nextSessions));
      void cacheWorkoutDay(date, nextSessions);
      setShowDeleteExerciseConfirm(false);
      setDeletingExerciseId(null);
    } catch (err) {
      if (!navigator.onLine || err instanceof TypeError) {
        const nextSessions = sessions.map((session) => ({
          ...session,
          sets: session.sets.filter((set) => set.exercise.id !== exerciseId),
        }));
        setSessions(nextSessions);
        setExercises(groupSetsByExercise(nextSessions));
        void cacheWorkoutDay(date, nextSessions);
        await enqueueDeleteExerciseMutation(date, exerciseId);
        setSyncError('Guardado offline. Se sincronizará cuando vuelva internet.');
        setShowDeleteExerciseConfirm(false);
        setDeletingExerciseId(null);
      } else {
        setSyncError(err instanceof Error ? err.message : 'No se pudo eliminar el ejercicio');
      }
    } finally {
      setDeletingExercise(false);
    }
  };

  const nextExerciseIndex = exercises.findIndex((exerciseGroup) =>
    exerciseGroup.sets.some((set) => !set.isDone)
  );

  const handleExerciseOpen = (
    event: MouseEvent<HTMLButtonElement>,
    exerciseGroup: ExerciseGroup
  ) => {
    if (skipNextExerciseOpenRef.current) {
      skipNextExerciseOpenRef.current = false;
      return;
    }

    const setCountText = `${exerciseGroup.sets.length} set${exerciseGroup.sets.length > 1 ? 's' : ''}`;
    try {
      sessionStorage.setItem(
        SHARED_EXERCISE_TITLE_KEY,
        JSON.stringify({
          date,
          exerciseId: exerciseGroup.exerciseId,
          title: exerciseGroup.exerciseName,
          setCountText,
        })
      );
    } catch {
      // Ignora errores de storage para no bloquear navegacion.
    }

    event.currentTarget.blur();
    setTransitioningExerciseId(exerciseGroup.exerciseId);
    setTransitioning(true);
    setTargetRoute(`/workout/${date}/${exerciseGroup.exerciseId}`);
  };

  const persistExerciseOrder = async (orderedExerciseIds: string[]) => {
    const response = await fetch(`/api/workouts/by-date/${date}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ orderedExerciseIds }),
    });

    if (!response.ok) {
      throw new Error('No se pudo guardar el nuevo orden');
    }
  };

  const schedulePersistExerciseOrder = (orderedExerciseIds: string[]) => {
    latestOrderedExerciseIdsRef.current = orderedExerciseIds;

    if (persistReorderTimeoutRef.current !== null) {
      globalThis.window.clearTimeout(persistReorderTimeoutRef.current);
    }

    persistReorderTimeoutRef.current = globalThis.window.setTimeout(async () => {
      try {
        await persistExerciseOrder(latestOrderedExerciseIdsRef.current);
      } catch (err) {
        if (!navigator.onLine || err instanceof TypeError) {
          await enqueueReorderMutation(date, latestOrderedExerciseIdsRef.current);
        } else {
          setError(err instanceof Error ? err.message : 'No se pudo reordenar');
        }
      }
    }, REORDER_PERSIST_DEBOUNCE_MS);
  };

  const handleDropExercise = (targetExerciseId: string) => {
    if (!draggingExerciseId || draggingExerciseId === targetExerciseId) {
      return;
    }

    skipNextExerciseOpenRef.current = true;

    const reordered = reorderExerciseGroups(exercises, draggingExerciseId, targetExerciseId);
    if (reordered === exercises) {
      resetDragState();
      return;
    }

    // Clear drag transform first, then commit list reorder to avoid visible jumping.
    resetDragState();
    if (reorderFrameRef.current !== null) {
      globalThis.window.cancelAnimationFrame(reorderFrameRef.current);
    }

    reorderFrameRef.current = globalThis.window.requestAnimationFrame(() => {
      setExercises(reordered);
      const orderPatches = reordered.flatMap((group, idx) =>
        group.sets.map((set) => ({ id: set.id, exerciseOrder: idx })),
      );
      void patchCachedSetsInDay(date, orderPatches);
      schedulePersistExerciseOrder(reordered.map((exercise) => exercise.exerciseId));
      reorderFrameRef.current = null;
    });
  };

  const resetDragState = () => {
    setDraggingExerciseId(null);
    setDragOverExerciseId(null);
    setDragOffset({ x: 0, y: 0 });
    touchStartPointRef.current = null;
    touchActiveExerciseIdRef.current = null;
    touchDraggingRef.current = false;
    dragOriginPointRef.current = null;
    pendingDragPointRef.current = null;
    if (dragRafIdRef.current !== null) {
      globalThis.window.cancelAnimationFrame(dragRafIdRef.current);
      dragRafIdRef.current = null;
    }
    globalThis.window.setTimeout(() => {
      skipNextExerciseOpenRef.current = false;
    }, 0);
  };

  const flushDragOffset = () => {
    const point = pendingDragPointRef.current;
    const origin = dragOriginPointRef.current;

    dragRafIdRef.current = null;

    if (!point || !origin) {
      return;
    }

    setDragOffset({
      x: point.x - origin.x,
      y: point.y - origin.y,
    });
  };

  const updateDragOffset = (clientX: number, clientY: number) => {
    const origin = dragOriginPointRef.current;
    if (!origin) {
      return;
    }

    pendingDragPointRef.current = { x: clientX, y: clientY };

    if (dragRafIdRef.current !== null) {
      return;
    }

    dragRafIdRef.current = globalThis.window.requestAnimationFrame(flushDragOffset);
  };

  const getExerciseIdFromPoint = (x: number, y: number, excludeExerciseId?: string): string | null => {
    const elements = document.elementsFromPoint(x, y);

    for (const element of elements) {
      const card = element.closest('[data-exercise-card-id]') as HTMLElement | null;
      const exerciseId = card?.dataset.exerciseCardId;

      if (!exerciseId) {
        continue;
      }

      if (excludeExerciseId && exerciseId === excludeExerciseId) {
        continue;
      }

      return exerciseId;
    }

    return null;
  };

  const handleCardTouchStart = (event: TouchEvent<HTMLElement>, exerciseId: string) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    dragOriginPointRef.current = { x: touch.clientX, y: touch.clientY };
    touchActiveExerciseIdRef.current = exerciseId;
    touchDraggingRef.current = false;
  };

  const handleCardTouchMove = (event: TouchEvent<HTMLElement>) => {
    const activeExerciseId = touchActiveExerciseIdRef.current;
    const touch = event.touches[0];
    const start = touchStartPointRef.current;

    if (!activeExerciseId || !touch || !start) {
      return;
    }

    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);
    const movedEnough = deltaX > TOUCH_DRAG_THRESHOLD_PX || deltaY > TOUCH_DRAG_THRESHOLD_PX;

    if (!touchDraggingRef.current && movedEnough) {
      touchDraggingRef.current = true;
      skipNextExerciseOpenRef.current = true;
      setDraggingExerciseId(activeExerciseId);
      setDragOverExerciseId(activeExerciseId);
    }

    if (!touchDraggingRef.current) {
      return;
    }

    event.preventDefault();
    updateDragOffset(touch.clientX, touch.clientY);

    const targetExerciseId = getExerciseIdFromPoint(touch.clientX, touch.clientY, activeExerciseId);
    if (targetExerciseId && targetExerciseId !== dragOverExerciseId) {
      setDragOverExerciseId(targetExerciseId);
    }
  };

  const handleCardTouchEnd = () => {
    const activeExerciseId = touchActiveExerciseIdRef.current;
    const targetExerciseId = dragOverExerciseId;
    const isDragging = touchDraggingRef.current;

    if (!activeExerciseId || !isDragging) {
      resetDragState();
      return;
    }

    handleDropExercise(targetExerciseId ?? activeExerciseId);
  };

  if (loading) {
    return <FullscreenLoader label="Cargando workout..." />;
  }

  if (error) {
    return (
      <main className="app-canvas min-h-screen px-4 py-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

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
            <p className="text-lg text-gray-400 font-heading uppercase tracking-wider">
              {displayDate
                ? displayDate.toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })
                : date}
            </p>
            <h1 className="text-4xl sm:text-5xl font-heading font-black leading-tight text-white drop-shadow-md uppercase">
              Workout
            </h1>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {/* Botón reprogramar solo icono */}
            <button
              onClick={() => setShowRescheduleModal(true)}
              disabled={sessionIds.length === 0 || rescheduling}
              className="btn-dark p-2"
              title="Reprogramar día"
              aria-label="Reprogramar día"
            >
              <CalendarDays size={22} className="text-sky-300" />
            </button>

            {/* Botón eliminar solo icono */}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={sessionIds.length === 0 || deleting}
              className="btn-dark p-2"
              title="Eliminar workout"
              aria-label="Eliminar workout"
            >
              <Trash2 size={22} className="text-red-400" />
            </button>
          </div>
        </div>

        {rescheduledSources.length > 0 && (
          <div className="mb-6 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            Este workout fue reprogramado desde {rescheduledSources.map((source) => formatDisplayDate(source)).join(', ')}.
          </div>
        )}


        {/* Lista de ejercicios tipo tarjetas */}
        <div className="flex flex-col gap-6 pb-24">
          {exercises.map((exerciseGroup, idx) => {
            const isNext = idx === nextExerciseIndex;
            const isSelected = transitioningExerciseId === exerciseGroup.exerciseId;
            const isDraggingThisCard = draggingExerciseId === exerciseGroup.exerciseId;
            const isDragTargetCard = dragOverExerciseId === exerciseGroup.exerciseId;
            const isComplete =
              exerciseGroup.sets.length > 0 && exerciseGroup.sets.every((set) => Boolean(set.isDone));
            const isCompletionAnimating = Boolean(recentlyCompletedExerciseIds[exerciseGroup.exerciseId]);
            const baseCardClass = isNext
              ? 'relative rounded-2xl bg-accent text-[#101010] shadow-lg p-6 text-left transition-all min-h-25'
              : 'relative panel-soft p-6 text-white text-left transition-all min-h-25';
            let selectedCardClass = '';
            if (isSelected && isNext) {
              selectedCardClass = 'scale-[0.98] -translate-y-1';
            } else if (isSelected) {
              selectedCardClass = 'scale-[0.98] -translate-y-1 opacity-80';
            }
            return (
              <button
                key={exerciseGroup.exerciseId}
                data-exercise-card-id={exerciseGroup.exerciseId}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragOverExerciseId !== exerciseGroup.exerciseId) {
                    setDragOverExerciseId(exerciseGroup.exerciseId);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  handleDropExercise(exerciseGroup.exerciseId);
                }}
                onClick={(event) => handleExerciseOpen(event, exerciseGroup)}
                className={`${baseCardClass} ${selectedCardClass} cursor-pointer pr-12 pb-12 pl-12 ${isDragTargetCard ? 'ring-2 ring-sky-300/70 drag-card--target' : ''} ${isDraggingThisCard ? 'opacity-85 drag-card--active transition-none' : ''}`}
                style={
                  isDraggingThisCard
                    ? { transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` }
                    : undefined
                }
              >
                <div className="mb-1 flex items-center justify-between gap-3">
                  <span className={isNext ? 'text-xs font-heading uppercase tracking-widest opacity-70' : 'text-xs font-heading uppercase tracking-widest text-gray-400'}>
                    Ejercicio
                  </span>
                  <span
                    className={`${isNext ? 'text-xs font-bold text-[#101010]' : 'text-xs text-gray-400'} transition-all duration-250 ease-out ${transitioningExerciseId === exerciseGroup.exerciseId ? '-translate-y-3 scale-105 opacity-80' : ''}`}
                  >
                    {exerciseGroup.sets.length} set{exerciseGroup.sets.length > 1 ? 's' : ''}
                  </span>
                </div>
                <span
                  draggable
                  onDragStart={(event) => {
                    event.stopPropagation();
                    setDraggingExerciseId(exerciseGroup.exerciseId);
                    setDragOverExerciseId(exerciseGroup.exerciseId);
                    dragOriginPointRef.current = { x: event.clientX, y: event.clientY };
                    setDragOffset({ x: 0, y: 0 });
                  }}
                  onDrag={(event) => {
                    if (event.clientX === 0 && event.clientY === 0) {
                      return;
                    }

                    updateDragOffset(event.clientX, event.clientY);
                  }}
                  onDragEnd={() => {
                    resetDragState();
                  }}
                  onTouchStart={(event) => handleCardTouchStart(event, exerciseGroup.exerciseId)}
                  onTouchMove={handleCardTouchMove}
                  onTouchEnd={handleCardTouchEnd}
                  onTouchCancel={resetDragState}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Reordenar ${exerciseGroup.exerciseName}`}
                  title={`Reordenar ${exerciseGroup.exerciseName}`}
                  className={`absolute right-3 bottom-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-gray-500 shadow-sm backdrop-blur-sm transition-colors active:cursor-grabbing hover:text-sky-300 ${isNext ? 'text-[#101010]/70' : 'text-gray-500'}`}
                >
                  <GripVertical size={18} className="pointer-events-none" />
                </span>
                <span
                  data-exercise-title
                  className={`set-card-title ${isNext || isComplete ? 'text-3xl font-black font-heading' : 'text-2xl font-bold font-heading'} ${isComplete ? 'set-card-title--done' : ''} transition-all duration-200 ${transitioningExerciseId === exerciseGroup.exerciseId ? '-translate-y-8 scale-110 opacity-70' : ''}`}
                >
                  <span
                    className={`set-card-title__label ${
                      isCompletionAnimating ? 'set-card-title__label--animate' : ''
                    }`}
                  >
                    {exerciseGroup.exerciseName}
                  </span>
                  {isComplete && (
                    <span
                      aria-hidden="true"
                      className={`set-card-brush-strike ${
                        isCompletionAnimating ? 'set-card-brush-strike--animate' : 'set-card-brush-strike--static'
                      }`}
                    />
                  )}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setDeletingExerciseId(exerciseGroup.exerciseId);
                    setShowDeleteExerciseConfirm(true);
                  }}
                  disabled={deletingExercise}
                  aria-label={`Eliminar ${exerciseGroup.exerciseName}`}
                  title={`Eliminar ${exerciseGroup.exerciseName}`}
                  className={`absolute left-3 bottom-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 shadow-sm backdrop-blur-sm transition-colors hover:text-red-300 disabled:opacity-50 ${isNext ? 'text-[#101010]/70' : 'text-gray-500'}`}
                >
                  <Trash2 size={18} className="pointer-events-none" />
                </button>
              </button>
            );
          })}
        </div>

        {exercises.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">
              {sessionIds.length > 0
                ? 'Este workout no tiene ejercicios cargados'
                : 'No hay ejercicios para este día'}
            </p>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            setAddExerciseError('');
            setShowAddExerciseModal(true);
          }}
          disabled={addingExercise}
          className="add-exercise-fab"
          aria-label="Agregar ejercicio a este día"
          title="Agregar ejercicio a este día"
        >
          <Plus size={26} />
        </button>

        {syncError && (
          <div className="mt-4 rounded-lg border border-amber-300/50 bg-amber-300/15 px-3 py-2 text-xs font-semibold text-amber-100">
            {syncError}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Eliminar Workout"
        message="Esta acción eliminará este workout y todos sus sets. ¿Deseas continuar?"
        onConfirm={handleDeleteWorkout}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDanger
      />

      <ConfirmDialog
        isOpen={showDeleteExerciseConfirm}
        title="Eliminar ejercicio"
        message="Esta acción eliminará todas las series de este ejercicio en el día. ¿Deseas continuar?"
        onConfirm={handleDeleteExercise}
        onCancel={() => {
          setShowDeleteExerciseConfirm(false);
          setDeletingExerciseId(null);
        }}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDanger
      />

      <ExerciseFormModal
        isOpen={showAddExerciseModal}
        onClose={() => {
          setShowAddExerciseModal(false);
          setAddExerciseError('');
        }}
        onSave={handleAddExercise}
        accessoryOnly
      />

      {addExerciseError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-lg border border-red-400/40 bg-red-500/20 px-4 py-2 text-xs font-semibold text-red-100 shadow-lg">
          {addExerciseError}
        </div>
      )}

      <Modal
        isOpen={showRescheduleModal}
        onClose={() => setShowRescheduleModal(false)}
        title="Reprogramar Workout"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            Esto moverá este workout de forma puntual. La plantilla semanal no se modifica.
          </p>

          <div>
            <label htmlFor="reschedule-date" className="mb-2 block text-sm font-medium text-gray-200">
              Nueva fecha
            </label>
            <input
              id="reschedule-date"
              type="date"
              value={rescheduleDate}
              onChange={(event) => setRescheduleDate(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-[#12171d] px-3 py-2 text-white outline-none transition-colors focus:border-[#74c9ff]"
            />
          </div>

          <div>
            <label htmlFor="reschedule-reason" className="mb-2 block text-sm font-medium text-gray-200">
              Motivo (opcional)
            </label>
            <textarea
              id="reschedule-reason"
              value={rescheduleReason}
              onChange={(event) => setRescheduleReason(event.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Ej: gym cerrado por feriado"
              className="w-full resize-none rounded-xl border border-white/15 bg-[#12171d] px-3 py-2 text-white outline-none transition-colors focus:border-[#74c9ff]"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowRescheduleModal(false)}
              className="btn-dark px-4 py-2"
              disabled={rescheduling}
            >
              Cancelar
            </button>
            <button
              onClick={handleRescheduleWorkout}
              className="btn-accent px-4 py-2"
              disabled={rescheduling || sessionIds.length === 0}
            >
              Confirmar reprogramación
            </button>
          </div>
        </div>
      </Modal>

      <style jsx global>{`
        .set-card-title {
          position: relative;
          display: inline-flex;
          align-items: center;
          line-height: 1.05;
        }

        .drag-card--active {
          z-index: 20;
          box-shadow: 0 24px 60px rgba(5, 12, 20, 0.45);
          will-change: transform;
        }

        .drag-card--target {
          animation: drag-card-target 520ms ease-in-out infinite;
        }

        .add-exercise-fab {
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
        .add-exercise-fab:active {
          transform: scale(0.96);
          box-shadow: 0 10px 24px rgba(214, 255, 67, 0.18);
        }
        .add-exercise-fab svg {
          transform: translateY(-2px);
        }
        .add-exercise-fab:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .set-card-title--done {
          color: #ffe7e7;
        }

        .set-card-title__label {
          display: inline-block;
          transform-origin: center center;
        }

        .set-card-title__label--animate {
          animation: set-card-title-zoom-in 180ms ease-in both;
        }

        .set-card-brush-strike {
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

        .set-card-brush-strike--animate {
          animation: set-card-brush-strike-draw 620ms cubic-bezier(0.23, 1, 0.32, 1) 150ms both;
        }

        .set-card-brush-strike--static {
          opacity: 0.88;
          transform: translateY(-50%) scaleX(1);
        }

        @keyframes set-card-title-zoom-in {
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

        @keyframes set-card-brush-strike-draw {
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

        @keyframes drag-card-lift {
          0% {
            transform: translateY(0) scale(1) rotate(0deg);
          }
          100% {
            transform: translateY(-3px) scale(1.02) rotate(-0.7deg);
          }
        }

        @keyframes drag-card-target {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1px);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
