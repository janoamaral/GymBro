import { expect, test, type APIRequestContext } from '@playwright/test';

function isoDate(daysFromToday: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

async function createSession(
  request: APIRequestContext,
  date: string,
  title: string,
): Promise<{ sessionId: string; setId: string }> {
  const sessionResponse = await request.post('/api/workouts', { data: { title } });
  expect(sessionResponse.ok()).toBeTruthy();
  const sessionId = (await sessionResponse.json()).session.id as string;

  if (date !== isoDate(0)) {
    const moveResponse = await request.patch(`/api/workouts/${sessionId}`, {
      data: { rescheduledToLocalDate: date },
    });
    expect(moveResponse.ok()).toBeTruthy();
  }

  const setResponse = await request.post(`/api/workouts/${sessionId}/sets`, {
    data: {
      exerciseName: 'E2E Dynamic Squat',
      liftId: 'SQ',
      repsTarget: 10,
      targetWeight: 100,
      unit: 'kg',
    },
  });
  expect(setResponse.ok()).toBeTruthy();
  return { sessionId, setId: (await setResponse.json()).set.id as string };
}

test('accepts a recalculated session and preserves both plan snapshots', async ({ page, request }) => {
  const createdSessionIds: string[] = [];
  try {
    for (const daysAgo of [-20, -13, -6]) {
      const historical = await createSession(
        request,
        isoDate(daysAgo),
        `E2E Recalc History ${daysAgo}`,
      );
      createdSessionIds.push(historical.sessionId);
      const completion = await request.patch(
        `/api/workouts/${historical.sessionId}/sets/${historical.setId}`,
        { data: { isDone: true, repsDone: 12, rir: 2 } },
      );
      expect(completion.ok()).toBeTruthy();
    }

    const today = isoDate(0);
    const current = await createSession(request, today, 'E2E Dynamic Recalculation');
    createdSessionIds.push(current.sessionId);

    await page.goto(`/workout/${today}`);
    const suggestion = page.getByText(/Ajuste moderado/i);
    await expect(suggestion).toBeVisible();
    await suggestion.click();
    await page.getByRole('button', { name: 'Aceptar ajuste' }).click();
    await expect(suggestion).not.toBeVisible();

    const execution = await request.patch(
      `/api/workouts/${current.sessionId}/sets/${current.setId}`,
      { data: { isDone: true, repsDone: 10 } },
    );
    expect(execution.ok()).toBeTruthy();

    const verifyResponse = await request.get(`/api/workouts/by-date/${today}`);
    expect(verifyResponse.ok()).toBeTruthy();
    const verifyBody = await verifyResponse.json();
    const session = (verifyBody.sessions as Array<{
      id: string;
      recalculationVersion: number | null;
      originalPlan: unknown;
      recalculatedPlan: unknown;
      sets: Array<{ id: string; isDone: boolean }>;
    }>).find((item) => item.id === current.sessionId);

    expect(session?.recalculationVersion).toBe(1);
    expect(Array.isArray(session?.originalPlan)).toBe(true);
    expect(Array.isArray(session?.recalculatedPlan)).toBe(true);
    expect(session?.sets.find((set) => set.id === current.setId)?.isDone).toBe(true);
  } finally {
    await Promise.all(createdSessionIds.map((id) => request.delete(`/api/workouts/${id}`)));
  }
});
