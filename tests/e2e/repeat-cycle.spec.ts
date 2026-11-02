import { expect, test, type APIRequestContext } from '@playwright/test';

function isoDate(daysFromToday: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

async function createWorkout(
  request: APIRequestContext,
  date: string,
  exerciseName: string,
  weight: number,
): Promise<string> {
  const workoutResponse = await request.post('/api/workouts', {
    data: { title: `Repeat source ${exerciseName}` },
  });
  expect(workoutResponse.ok()).toBeTruthy();
  const sessionId = (await workoutResponse.json()).session.id as string;

  const moveResponse = await request.patch(`/api/workouts/${sessionId}`, {
    data: { rescheduledToLocalDate: date },
  });
  expect(moveResponse.ok()).toBeTruthy();

  const setResponse = await request.post(`/api/workouts/${sessionId}/sets`, {
    data: { exerciseName, repsTarget: 5, targetWeight: weight, unit: 'kg' },
  });
  expect(setResponse.ok()).toBeTruthy();
  return sessionId;
}

test('repeats the latest cycle with identical exercises and weights', async ({ request }) => {
  const sourceIds: string[] = [];
  const repeatedIds: string[] = [];
  try {
    sourceIds.push(await createWorkout(request, isoDate(1000), 'Repeat Squat', 77));
    sourceIds.push(await createWorkout(request, isoDate(1007), 'Repeat Bench', 88));

    const repeatResponse = await request.post('/api/plan/new-cycle', {
      data: { startDate: isoDate(1100), repeat: true },
    });
    expect(repeatResponse.ok()).toBeTruthy();
    const body = await repeatResponse.json();
    const sessions = body.sessions as Array<{
      id: string;
      startedAt: string;
      sets: Array<{ targetWeight: string | number; repsTarget: number }>;
    }>;
    repeatedIds.push(...sessions.map((session) => session.id));

    expect(sessions).toHaveLength(2);
    expect(sessions.map((session) => session.startedAt.slice(0, 10))).toEqual([
      isoDate(1100),
      isoDate(1107),
    ]);
    expect(sessions.map((session) => Number(session.sets[0].targetWeight))).toEqual([77, 88]);
    expect(sessions.map((session) => session.sets[0].repsTarget)).toEqual([5, 5]);
  } finally {
    await Promise.all([...repeatedIds, ...sourceIds].map((id) => request.delete(`/api/workouts/${id}`)));
  }
});
