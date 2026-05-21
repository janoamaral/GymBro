'use client';

import { useEffect, useMemo, useState } from 'react';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';
import { cacheResource, getCachedResource } from '@/lib/offline-queue';

type LiftId = 'SQ' | 'DL' | 'BP';

type WorkoutSet = {
  liftId: LiftId | null;
  repsDone: number | null;
  repsTarget: number;
  targetWeight: string;
  isDone: boolean;
};

type WorkoutSession = {
  startedAt: string;
  sets: WorkoutSet[];
};

type VolumeSummary = {
  liftId: LiftId;
  completedTonnage: number;
  plannedTonnage: number;
  completedSets: number;
  totalSets: number;
};

const LIFT_LABELS: Record<LiftId, string> = {
  SQ: 'Squat',
  BP: 'Bench',
  DL: 'Deadlift',
};

function getSessionDate(startedAt: string): number {
  return new Date(startedAt).getTime();
}

function getLast7DaysWindow(): { start: number; end: number } {
  const now = new Date();
  const end = now.getTime();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = startOfToday - 6 * 24 * 60 * 60 * 1000;

  return { start, end };
}

function getEmptySummaries(): Record<LiftId, VolumeSummary> {
  return {
    SQ: { liftId: 'SQ', completedTonnage: 0, plannedTonnage: 0, completedSets: 0, totalSets: 0 },
    BP: { liftId: 'BP', completedTonnage: 0, plannedTonnage: 0, completedSets: 0, totalSets: 0 },
    DL: { liftId: 'DL', completedTonnage: 0, plannedTonnage: 0, completedSets: 0, totalSets: 0 },
  };
}

function shouldIncludeSession(session: WorkoutSession, start: number, end: number): boolean {
  const sessionDate = getSessionDate(session.startedAt);
  return sessionDate >= start && sessionDate <= end;
}

function getBarWidthClass(percentage: number): string {
  if (percentage === 0) return 'w-0';
  if (percentage >= 90) return 'w-full';
  if (percentage >= 70) return 'w-[85%]';
  if (percentage >= 50) return 'w-[70%]';
  if (percentage >= 30) return 'w-[50%]';
  if (percentage >= 15) return 'w-[35%]';
  return 'w-[15%]';
}

function applyPlanned(summaries: Record<LiftId, VolumeSummary>, liftId: LiftId, reps: number, weight: number): void {
  if (Number.isFinite(reps) && reps > 0) {
    summaries[liftId].plannedTonnage += reps * weight;
    summaries[liftId].totalSets += 1;
  }
}

function applyCompleted(summaries: Record<LiftId, VolumeSummary>, liftId: LiftId, set: WorkoutSet, weight: number): void {
  const doneReps = set.repsDone ?? set.repsTarget;
  if (Number.isFinite(doneReps) && doneReps > 0) {
    summaries[liftId].completedTonnage += doneReps * weight;
    summaries[liftId].completedSets += 1;
  }
}

function processSet(summaries: Record<LiftId, VolumeSummary>, set: WorkoutSet): void {
  if (!set.liftId) return;
  const weight = Number(set.targetWeight);
  if (!Number.isFinite(weight) || weight <= 0) return;

  applyPlanned(summaries, set.liftId, set.repsTarget, weight);
  if (set.isDone) {
    applyCompleted(summaries, set.liftId, set, weight);
  }
}

function accumulateVolume(sessions: WorkoutSession[]): VolumeSummary[] {
  const nextSummaries = getEmptySummaries();
  for (const session of sessions) {
    for (const set of session.sets) {
      processSet(nextSummaries, set);
    }
  }
  return [nextSummaries.SQ, nextSummaries.BP, nextSummaries.DL];
}


export function VolumeByLiftCard() {
  const [summaries, setSummaries] = useState<VolumeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const cacheKey = 'volume-by-lift-7d';

    const hydrateCachedVolume = async () => {
      try {
        const cached = await getCachedResource<VolumeSummary[]>(cacheKey);
        if (!isActive || !cached) {
          return;
        }

        setSummaries(cached);
        setLoading(false);
      } catch {
        // Ignora errores de cache local.
      }
    };

    void hydrateCachedVolume();

    const loadVolume = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await fetchJsonWithInFlightDedup<{ sessions: WorkoutSession[] }>('/api/workouts');

        const { start, end } = getLast7DaysWindow();
        const sessions = data.sessions.filter((session) => shouldIncludeSession(session, start, end));

        if (!isActive) {
          return;
        }

        const nextSummaries = accumulateVolume(sessions);
        setSummaries(nextSummaries);
        await cacheResource(cacheKey, nextSummaries);
      } catch (fetchError) {
        if (!isActive) {
          return;
        }

        if (navigator.onLine) {
          setError(fetchError instanceof Error ? fetchError.message : 'FAILED_TO_LOAD_VOLUME');
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    loadVolume();

    return () => {
      isActive = false;
    };
  }, []);

  const hasAnyPlanned = useMemo(
    () => summaries.some((summary) => summary.plannedTonnage > 0),
    [summaries],
  );

  let content: React.ReactNode;

  if (loading) {
    content = (
      <div className="space-y-3">
        {['SQ', 'BP', 'DL'].map((lift) => (
          <div key={lift} className="h-16 animate-pulse rounded-2xl bg-white/5" />
        ))}
      </div>
    );
  } else if (error) {
    content = <p className="text-sm text-red-300">{error}</p>;
  } else if (hasAnyPlanned) {
    content = (
      <div className="space-y-3">
        {summaries.map((summary) => {
          const percentage =
            summary.plannedTonnage > 0 ? (summary.completedTonnage / summary.plannedTonnage) * 100 : 0;
          const barWidthClass = getBarWidthClass(percentage);

          return (
            <div key={summary.liftId} className="rounded-2xl border border-white/8 bg-white/4 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-semibold text-white">{LIFT_LABELS[summary.liftId]}</p>
                  <p className="text-xs text-gray-400">
                    {summary.completedSets}/{summary.totalSets} sets &middot; {Math.round(percentage)}%
                  </p>
                </div>
                <p className="text-right font-mono text-sm text-[#e8f8b0]">
                  {Math.round(summary.completedTonnage)}
                  <span className="text-xs text-gray-500"> / {Math.round(summary.plannedTonnage)} kg</span>
                </p>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full bg-linear-to-r from-[#d6ff43] to-[#b6d900] transition-all ${barWidthClass}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    content = <p className="text-sm text-gray-400">Todavía no hay volumen registrado en la última semana.</p>;
  }

  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Analytics powerlifting</p>
          <h2 className="mt-1 text-xl font-bold text-white">Volumen por lift</h2>
          <p className="mt-1 text-sm text-gray-400">Últimos 7 días (incluye hoy), completado vs programado.</p>
        </div>
        <div className="rounded-full border border-[#d6ff43]/30 bg-[#d6ff43]/10 px-3 py-1 text-xs font-semibold text-[#e8f8b0]">
          7d
        </div>
      </div>

      {content}
    </section>
  );
}
