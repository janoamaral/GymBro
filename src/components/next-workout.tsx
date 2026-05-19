'use client';

import { useEffect, useState } from 'react';
import { CalendarDays } from 'lucide-react';

interface Set {
  id: string;
  liftId?: 'BP' | 'DL' | 'SQ' | 'OHP' | null;
  percentage?: number | null;
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

type LiftMarker = 'BP' | 'DL' | 'SQ' | 'OHP';

const LIFT_THEME: Record<LiftMarker, { card: string; badge: string; accent: string; name: string }> = {
  BP: {
    card: 'border-emerald-300/40 bg-gradient-to-br from-emerald-400/18 via-[#11161d] to-[#0e1319]',
    badge: 'border-emerald-300/45 bg-emerald-300/15 text-emerald-100',
    accent: 'text-emerald-200',
    name: 'Bench Press',
  },
  DL: {
    card: 'border-violet-300/40 bg-gradient-to-br from-violet-400/18 via-[#11161d] to-[#0e1319]',
    badge: 'border-violet-300/45 bg-violet-300/15 text-violet-100',
    accent: 'text-violet-200',
    name: 'Deadlift',
  },
  SQ: {
    card: 'border-fuchsia-300/40 bg-gradient-to-br from-fuchsia-400/18 via-[#11161d] to-[#0e1319]',
    badge: 'border-fuchsia-300/45 bg-fuchsia-300/15 text-fuchsia-100',
    accent: 'text-fuchsia-200',
    name: 'Squat',
  },
  OHP: {
    card: 'border-orange-300/40 bg-gradient-to-br from-orange-400/18 via-[#11161d] to-[#0e1319]',
    badge: 'border-orange-300/45 bg-orange-300/15 text-orange-100',
    accent: 'text-orange-200',
    name: 'Overhead Press',
  },
};

function isLiftMarker(value: string | null | undefined): value is LiftMarker {
  return value === 'BP' || value === 'DL' || value === 'SQ' || value === 'OHP';
}

function detect531Week(mainSets: Set[]): string {
  const firstMainSet = mainSets.find((set) => typeof set.percentage === 'number');
  if (!firstMainSet || firstMainSet.percentage === null) {
    return 'Semana ?';
  }

  const firstPercentage = Number(firstMainSet.percentage);
  if (firstPercentage <= 0.5) {
    return 'Semana 4';
  }

  if (firstPercentage < 0.68) {
    return 'Semana 1';
  }

  if (firstPercentage < 0.73) {
    return 'Semana 2';
  }

  return 'Semana 3';
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

  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
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

  const primarySet = session.sets.find((set) => isLiftMarker(set.liftId ?? null));
  const primaryLift = isLiftMarker(primarySet?.liftId ?? null) ? primarySet.liftId : null;
  const primaryTheme = primaryLift ? LIFT_THEME[primaryLift] : null;
  const primaryExerciseName = primarySet?.exercise.name ?? 'Main Lift';

  const mainSets = primaryLift
    ? session.sets.filter((set) => set.liftId === primaryLift)
    : [];

  const weekLabel = detect531Week(mainSets);
  const maxWeight = mainSets.length > 0
    ? Math.max(...mainSets.map((set) => Number(set.targetWeight)))
    : Math.max(...session.sets.map((set) => Number(set.targetWeight)));
  const maxUnit = mainSets[0]?.unit ?? session.sets[0]?.unit ?? 'kg';

  const accessoryExercises = Array.from(
    new Set(
      session.sets
        .filter((set) => set.exercise.name !== primaryExerciseName)
        .map((set) => set.exercise.name)
    )
  );

  const workoutIsoDate = session.startedAt.split('T')[0] ?? formatLocalDate(new Date(session.startedAt));

  return (
    <div className={`rounded-2xl border p-5 ${primaryTheme?.card ?? 'panel'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-200">Próximo Workout</h3>
        <div className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${primaryTheme?.badge ?? 'border-[#d6ff43]/45 bg-[#d6ff43]/10 text-[#e8f8b0]'}`}>
          <CalendarDays size={14} className={primaryTheme?.accent ?? 'text-[#d6ff43]'} />
          <p className="text-xs font-semibold uppercase tracking-[0.14em]">{formatIsoDateLabel(workoutIsoDate)}</p>
        </div>
      </div>

      {session.reschedule && session.reschedule.fromLocalDate !== session.reschedule.toLocalDate && (
        <p className="mb-4 rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          Reprogramado desde {formatIsoDateLabel(session.reschedule.fromLocalDate)}
          {session.reschedule.reason ? ` (${session.reschedule.reason})` : ''}
        </p>
      )}

      <div className="space-y-0.5">
        <p className="text-3xl font-bold text-white sm:text-4xl">
          {primaryLift && LIFT_THEME[primaryLift].name ? LIFT_THEME[primaryLift].name : primaryExerciseName}
        </p>
        <p className={`text-sm font-semibold ${primaryTheme?.accent ?? 'text-[#d6ff43]'}`}>
          {weekLabel} - max {maxWeight} {maxUnit}
        </p>
        <div className="space-y-1 pt-3 text-sm text-gray-300">
          {accessoryExercises.length === 0 ? (
            <p>Sin ejercicios complementarios.</p>
          ) : (
            accessoryExercises.map((exercise) => (
              <p key={exercise}>• {exercise}</p>
            ))
          )}
        </div>
      </div>

      <div className="mt-4">
        <a
          href={`/workout/${workoutIsoDate}`}
          className="text-xs uppercase tracking-[0.14em] text-gray-300 underline hover:text-white"
        >
          Ir al workout
        </a>
      </div>
    </div>
  );
}
