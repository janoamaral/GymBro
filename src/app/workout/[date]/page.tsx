'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, GripVertical, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { FullscreenLoader } from '@/components/ui/fullscreen-loader';

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


const WORKOUT_CACHE_KEY = 'workout-by-date-cache';

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
  const persistReorderTimeoutRef = useRef<number | null>(null);
  const latestOrderedExerciseIdsRef = useRef<string[]>([]);

  // Transicion simple: fade out al hacer click
  const [transitioning, setTransitioning] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string | null>(null);
  const [transitioningExerciseId, setTransitioningExerciseId] = useState<string | null>(null);
  const [recentlyCompletedExerciseIds, setRecentlyCompletedExerciseIds] = useState<Record<string, boolean>>({});
  const completionAnimationTimersRef = useRef<Record<string, number>>({});
  const previousExerciseCompletionRef = useRef<Record<string, boolean>>({});

  // Hidrata desde cache localStorage primero
  useEffect(() => {
    try {
      const cacheRaw = localStorage.getItem(WORKOUT_CACHE_KEY);
      if (cacheRaw) {
        const cache = JSON.parse(cacheRaw);
        if (cache[date]) {
          const fetchedSessions = cache[date] as SessionWithSets[];
          queueMicrotask(() => {
            setSessions(fetchedSessions);
            setExercises(groupSetsByExercise(fetchedSessions));
            setLoading(false);
          });
        }
      }
    } catch {}

    // Fetch en background y actualiza si hay cambios
    const fetchSessionsForDay = async () => {
      try {
        const res = await fetch(`/api/workouts/by-date/${date}`);
        if (!res.ok) throw new Error('Failed to fetch sessions');
        const data = await res.json();
        const fetchedSessions = data.sessions as SessionWithSets[];
        setSessions(fetchedSessions);
        setExercises(groupSetsByExercise(fetchedSessions));
        // Actualiza cache
        try {
          const cacheRaw = localStorage.getItem(WORKOUT_CACHE_KEY);
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
          cache[date] = fetchedSessions;
          localStorage.setItem(WORKOUT_CACHE_KEY, JSON.stringify(cache));
        } catch {}
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionsForDay();
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

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
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

      router.push(`/workout/${rescheduleDate}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setRescheduling(false);
      setShowRescheduleModal(false);
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
        setError(err instanceof Error ? err.message : 'No se pudo reordenar');
      }
    }, REORDER_PERSIST_DEBOUNCE_MS);
  };

  const handleDropExercise = async (targetExerciseId: string) => {
    if (!draggingExerciseId || draggingExerciseId === targetExerciseId) {
      return;
    }

    skipNextExerciseOpenRef.current = true;

    const reordered = reorderExerciseGroups(exercises, draggingExerciseId, targetExerciseId);
    if (reordered === exercises) {
      return;
    }

    setExercises(reordered);
    setDragOverExerciseId(null);
    schedulePersistExerciseOrder(reordered.map((exercise) => exercise.exerciseId));
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

  const handleCardTouchStart = (event: TouchEvent<HTMLButtonElement>, exerciseId: string) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    dragOriginPointRef.current = { x: touch.clientX, y: touch.clientY };
    touchActiveExerciseIdRef.current = exerciseId;
    touchDraggingRef.current = false;
  };

  const handleCardTouchMove = (event: TouchEvent<HTMLButtonElement>) => {
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

    void handleDropExercise(targetExerciseId ?? activeExerciseId).finally(() => {
      resetDragState();
    });
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
        <div className="flex flex-col gap-6">
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
                draggable
                onDragStart={(event) => {
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
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragOverExerciseId !== exerciseGroup.exerciseId) {
                    setDragOverExerciseId(exerciseGroup.exerciseId);
                  }
                }}
                onDrop={async (event) => {
                  event.preventDefault();
                  await handleDropExercise(exerciseGroup.exerciseId);
                }}
                onDragEnd={() => {
                  resetDragState();
                }}
                onTouchStart={(event) => handleCardTouchStart(event, exerciseGroup.exerciseId)}
                onTouchMove={handleCardTouchMove}
                onTouchEnd={handleCardTouchEnd}
                onTouchCancel={resetDragState}
                onClick={(event) => handleExerciseOpen(event, exerciseGroup)}
                className={`${baseCardClass} ${selectedCardClass} cursor-grab active:cursor-grabbing ${isDragTargetCard ? 'ring-2 ring-sky-300/70 drag-card--target' : ''} ${isDraggingThisCard ? 'opacity-85 drag-card--active transition-none' : ''}`}
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
                <GripVertical
                  size={16}
                  className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 ${isNext ? 'text-[#101010]/70' : 'text-gray-500'}`}
                />
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
