'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

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

interface Session {
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

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatIsoDateLabel(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) {
    return isoDate;
  }

  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString();
}

export function NextWorkout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNextWorkout = async () => {
      try {
        const localDate = formatLocalDate(new Date());
        const res = await fetch(`/api/workouts/next?localDate=${localDate}`);
        const data = await res.json();
        setSession(data.session);
      } catch (error) {
        console.error('Failed to fetch next workout:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNextWorkout();
  }, []);

  if (loading) {
    return (
      <div className="panel p-4">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="panel p-4">
        <h3 className="text-lg font-semibold text-white mb-2">Próximo Workout</h3>
        <p className="text-gray-400">No upcoming workouts</p>
      </div>
    );
  }

  // Group sets by exercise
  const exerciseGroups = session.sets.reduce(
    (acc, set) => {
      const key = set.exercise.name;
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(set);
      return acc;
    },
    {} as Record<string, Set[]>
  );

  return (
    <div className="panel p-4">
      <h3 className="text-lg font-semibold text-white mb-4">Próximo Workout</h3>
      <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
        <Clock size={16} />
        <span>{new Date(session.startedAt).toLocaleDateString()}</span>
      </div>
      {session.reschedule && session.reschedule.fromLocalDate !== session.reschedule.toLocalDate && (
        <p className="mb-4 rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          Reprogramado desde {formatIsoDateLabel(session.reschedule.fromLocalDate)}
          {session.reschedule.reason ? ` (${session.reschedule.reason})` : ''}
        </p>
      )}
      <div className="space-y-3">
        {Object.entries(exerciseGroups).map(([name, sets]) => (
          <div key={name} className="panel-soft rounded-xl p-3">
            <p className="font-semibold text-white mb-2">{name}</p>
            <div className="space-y-1 text-sm text-gray-300">
              {sets.map((set) => (
                <p key={set.id}>
                  Set {set.setNumber}: {set.repsTarget} reps @ {set.targetWeight} {set.unit}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
