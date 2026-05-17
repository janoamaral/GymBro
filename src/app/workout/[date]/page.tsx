'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
  sets: Set[];
}

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
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchSessionsForDay = async () => {
      try {
        const res = await fetch(`/api/workouts/by-date/${date}`);
        if (!res.ok) throw new Error('Failed to fetch sessions');

        const data = await res.json();

        // Group sets by exercise
        const groupMap = new Map<string, ExerciseGroup>();

        const sessions = data.sessions as SessionWithSets[];
        setSessionIds(sessions.map((session) => session.id));

        sessions.forEach((session) => {
          session.sets.forEach((set: Set) => {
            const key = set.exercise.id;
            if (!groupMap.has(key)) {
              groupMap.set(key, {
                exerciseId: set.exercise.id,
                exerciseName: set.exercise.name,
                sets: [],
              });
            }
            groupMap.get(key)!.sets.push(set);
          });
        });

        setExercises(Array.from(groupMap.values()));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchSessionsForDay();
  }, [date]);

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

  if (loading) {
    return (
      <main className="min-h-full bg-gray-900 px-4 py-8">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-full bg-gray-900 px-4 py-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-gray-900 px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-800 rounded transition-colors"
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
            onClick={() => setShowDeleteConfirm(true)}
            disabled={sessionIds.length === 0 || deleting}
            className="flex items-center gap-2 rounded bg-red-500/20 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/30 disabled:opacity-50"
          >
            <Trash2 size={16} />
            {deleting ? 'Eliminando...' : 'Eliminar workout'}
          </button>
        </div>

        {/* Exercises List */}
        <div className="space-y-4">
          {exercises.map((exerciseGroup) => (
            <button
              key={exerciseGroup.exerciseId}
              onClick={() => router.push(`/workout/${date}/${exerciseGroup.exerciseId}`)}
              className="w-full bg-gray-800 rounded-lg p-4 text-left hover:bg-gray-700 transition-colors"
            >
              <h3 className="text-xl font-semibold text-white">
                {exerciseGroup.exerciseName}
              </h3>
              <p className="mt-2 text-gray-400">
                {exerciseGroup.sets.length} set{exerciseGroup.sets.length !== 1 ? 's' : ''}
              </p>
            </button>
          ))}
        </div>

        {exercises.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No exercises for this day</p>
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
    </main>
  );
}
