'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

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

export default function WorkoutDayPage() {
  const router = useRouter();
  const params = useParams();
  const date = params.date as string;

  const [exercises, setExercises] = useState<ExerciseGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSessionsForDay = async () => {
      try {
        const res = await fetch(`/api/workouts/by-date/${date}`);
        if (!res.ok) throw new Error('Failed to fetch sessions');

        const data = await res.json();

        // Group sets by exercise
        const groupMap = new Map<string, ExerciseGroup>();

        data.sessions.forEach((session: any) => {
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
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-800 rounded transition-colors"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-white">Workout</h1>
            <p className="text-gray-400">
              {new Date(date).toLocaleDateString('es-ES', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
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
    </main>
  );
}
