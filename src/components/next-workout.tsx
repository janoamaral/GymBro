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
      <div className="panel p-5">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="panel p-5">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">Próximo Workout</h3>
        <p className="text-gray-400">No hay workouts próximos</p>
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
    <div className="panel p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-gray-300">Próximo Workout</h3>
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Clock size={16} />
        <span>{new Date(session.startedAt).toLocaleDateString()}</span>
      </div>
      {session.reschedule && session.reschedule.fromLocalDate !== session.reschedule.toLocalDate && (
        <p className="mb-4 rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          Reprogramado desde {formatIsoDateLabel(session.reschedule.fromLocalDate)}
          {session.reschedule.reason ? ` (${session.reschedule.reason})` : ''}
        </p>
      )}
      <div className="space-y-2.5">
        {Object.entries(exerciseGroups).map(([name, sets]) => (
          <div key={name} className="rounded-xl border border-white/10 bg-[#10151b] px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-lg font-bold text-white">{name}</p>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-gray-300">
                {sets.length} set{sets.length > 1 ? 's' : ''}
              </span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-gray-300">
              {sets.map((set) => (
                <p key={set.id}>
                  Serie {set.setNumber}: {set.repsTarget} reps @ {set.targetWeight} {set.unit}
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
