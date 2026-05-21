'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';
import { cacheResource, cacheWorkoutDay } from '@/lib/offline-queue';

type NextWorkoutSet = {
  exercise: {
    id: string;
  };
};

type NextWorkoutSession = {
  id: string;
  startedAt: string;
  sets: NextWorkoutSet[];
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
      try {
        const localDate = formatLocalDate(new Date());
        const data = await fetchJsonWithInFlightDedup<{ session: NextWorkoutSession | null }>(
          `/api/workouts/next?localDate=${localDate}`,
        );

        if (cancelled) {
          return;
        }

        await cacheResource('next-workout', data.session);

        if (data.session) {
          const sessionDate = data.session.startedAt.split('T')[0] ?? localDate;
          await cacheWorkoutDay(sessionDate, [data.session]);

          router.prefetch(`/workout/${sessionDate}`);

          const exerciseIds = Array.from(new Set(data.session.sets.map((set) => set.exercise.id)));
          exerciseIds.forEach((exerciseId) => {
            router.prefetch(`/workout/${sessionDate}/${exerciseId}`);
          });
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
