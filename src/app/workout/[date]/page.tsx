'use client';

import { useEffect, useState, type MouseEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';
import { FullscreenLoader } from '@/components/ui/fullscreen-loader';

const SHARED_EXERCISE_TITLE_KEY = 'shared-exercise-title-transition';

interface Set {
  id: string;
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
        sets: [],
      };

      currentGroup.sets.push(set);
      acc.set(key, currentGroup);
      return acc;
    }, new Map<string, ExerciseGroup>());

  return Array.from(grouped.values());
};


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

  // Transicion simple: fade out al hacer click
  const [transitioning, setTransitioning] = useState(false);
  const [targetRoute, setTargetRoute] = useState<string | null>(null);
  const [transitioningExerciseId, setTransitioningExerciseId] = useState<string | null>(null);

  // Hidrata desde cache localStorage primero
  useEffect(() => {
    setLoading(true);
    setError('');
    let hydrated = false;
    try {
      const cacheRaw = localStorage.getItem(WORKOUT_CACHE_KEY);
      if (cacheRaw) {
        const cache = JSON.parse(cacheRaw);
        if (cache[date]) {
          const fetchedSessions = cache[date] as SessionWithSets[];
          setSessions(fetchedSessions);
          setExercises(groupSetsByExercise(fetchedSessions));
          hydrated = true;
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
    // Si no se pudo hidratar, loading se apaga tras fetch; si sí, loading se apaga ya
    if (hydrated) setLoading(false);
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
            const baseCardClass = isNext
              ? 'relative rounded-2xl bg-accent text-[#101010] shadow-lg p-6 text-left transition-all min-h-25'
              : 'panel-soft p-6 text-white text-left transition-all min-h-25';
            let selectedCardClass = '';
            if (isSelected && isNext) {
              selectedCardClass = 'scale-[0.98] -translate-y-1';
            } else if (isSelected) {
              selectedCardClass = 'scale-[0.98] -translate-y-1 opacity-80';
            }
            return (
              <button
                key={exerciseGroup.exerciseId}
                onClick={(event) => handleExerciseOpen(event, exerciseGroup)}
                className={`${baseCardClass} ${selectedCardClass}`}
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
                  data-exercise-title
                  className={`${isNext ? 'text-3xl font-black font-heading' : 'text-2xl font-bold font-heading'} transition-all duration-200 ${transitioningExerciseId === exerciseGroup.exerciseId ? '-translate-y-8 scale-110 opacity-70' : ''}`}
                >
                  {exerciseGroup.exerciseName}
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
    </main>
  );
}
