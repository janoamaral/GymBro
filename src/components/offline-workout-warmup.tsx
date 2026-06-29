'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';
import { cacheResource, cacheWorkoutDay } from '@/lib/offline-queue';

type NextWorkoutSession = {
  id: string;
  startedAt: string;
  sets: Array<{ exercise: { id: string } }>;
};

type ByDateResponse = {
  sessions: NextWorkoutSession[];
};

type NextResponse = {
  session: NextWorkoutSession | null;
};

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function OfflineWorkoutWarmup() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const warmup = async () => {
      const localDate = formatLocalDate(new Date());

      try {
        const byDate = await fetchJsonWithInFlightDedup<ByDateResponse>(
          `/api/workouts/by-date/${localDate}`,
        );

        if (cancelled) {
          return;
        }

        const sessions = byDate.sessions ?? [];
        if (sessions.length > 0) {
          await cacheWorkoutDay(localDate, sessions);
          router.prefetch(`/workout/${localDate}`);

          const exerciseIds = Array.from(
            new Set(sessions.flatMap((session) => session.sets.map((set) => set.exercise.id))),
          );
          exerciseIds.forEach((exerciseId) => {
            router.prefetch(`/workout/${localDate}/${exerciseId}`);
          });
        }
      } catch {
        // Warmup best-effort.
      }

      // Keep next-workout card cache in sync (independent of by-date shape).
      try {
        const nextData = await fetchJsonWithInFlightDedup<NextResponse>(
          `/api/workouts/next?localDate=${localDate}`,
        );

        if (cancelled) {
          return;
        }

        await cacheResource('next-workout', nextData.session);

        if (nextData.session) {
          const sessionDate = nextData.session.startedAt.split('T')[0] ?? localDate;
          router.prefetch(`/workout/${sessionDate}`);
        }
      } catch {
        // Warmup best-effort.
      }
    };

    void warmup();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}