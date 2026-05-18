'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Modal } from '@/components/ui/modal';

interface Set {
  id: string;
  setNumber: number;
  repsTarget: number;
  targetWeight: number;
  unit: string;
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

export default function WorkoutDayPage() {
  const router = useRouter();
  const params = useParams();
  const date = params.date as string;

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

  useEffect(() => {
    const fetchSessionsForDay = async () => {
      try {
        const res = await fetch(`/api/workouts/by-date/${date}`);
        if (!res.ok) throw new Error('Failed to fetch sessions');

        const data = await res.json();

        const fetchedSessions = data.sessions as SessionWithSets[];
        setSessions(fetchedSessions);
        setExercises(groupSetsByExercise(fetchedSessions));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionsForDay();
  }, [date]);

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

  if (loading) {
    return (
      <main className="app-canvas min-h-full px-4 py-8">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-canvas min-h-full px-4 py-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="app-canvas min-h-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              title="Volver"
              aria-label="Volver"
              className="btn-dark p-2"
            >
              <ArrowLeft size={24} className="text-white" />
            </button>
            <div>
              <h1 className="text-4xl font-bold text-white">Workout</h1>
              <p className="text-gray-400">
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
            </div>
          </div>

          <button
            onClick={() => setShowRescheduleModal(true)}
            disabled={sessionIds.length === 0 || rescheduling}
            className="flex items-center gap-2 rounded bg-sky-500/20 px-4 py-2 text-sm font-medium text-sky-100 transition-colors hover:bg-sky-500/30 disabled:opacity-50"
          >
            <CalendarDays size={16} />
            {rescheduling ? 'Reprogramando...' : 'Reprogramar día'}
          </button>

          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={sessionIds.length === 0 || deleting}
            className="flex items-center gap-2 rounded bg-red-500/20 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/30 disabled:opacity-50"
          >
            <Trash2 size={16} />
            {deleting ? 'Eliminando...' : 'Eliminar workout'}
          </button>
        </div>

        {rescheduledSources.length > 0 && (
          <div className="mb-6 rounded-xl border border-sky-400/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            Este workout fue reprogramado desde {rescheduledSources.map((source) => formatDisplayDate(source)).join(', ')}.
          </div>
        )}

        {/* Exercises List */}
        <div className="space-y-4">
          {exercises.map((exerciseGroup) => (
            <button
              key={exerciseGroup.exerciseId}
              onClick={() => router.push(`/workout/${date}/${exerciseGroup.exerciseId}`)}
              className="panel w-full p-4 text-left transition-colors"
            >
              <h3 className="text-xl font-semibold text-white">
                {exerciseGroup.exerciseName}
              </h3>
              <p className="mt-2 text-gray-400">
                {exerciseGroup.sets.length} set{exerciseGroup.sets.length > 1 ? 's' : ''}
              </p>
            </button>
          ))}
        </div>

        {exercises.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">
              {sessionIds.length > 0
                ? 'Este workout no tiene ejercicios cargados'
                : 'No exercises for this day'}
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
