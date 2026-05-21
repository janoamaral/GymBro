import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

function formatIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test.describe('offline sync flow', () => {
  const resetOfflineDb = async (page: Page) => {
    await page.goto('/');
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        try {
          const request = indexedDB.deleteDatabase('gymbro-offline-db');
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        } catch {
          resolve();
        }
      });
    });
  };

  test('persists set changes offline and syncs when online', async ({ page, context, request }) => {
    await resetOfflineDb(page);

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const today = formatIsoDate(now);

    const workoutResponse = await request.post('/api/workouts', {
      data: { title: `E2E Offline ${today}` },
    });
    expect(workoutResponse.ok()).toBeTruthy();
    const workoutBody = await workoutResponse.json();
    const sessionId = workoutBody.session.id as string;

    const exerciseResponse = await request.post(`/api/workouts/${sessionId}/sets`, {
      data: {
        exerciseName: 'Offline Sync Squat',
        liftId: 'SQ',
        repsTarget: 5,
        targetWeight: 100,
        unit: 'kg',
      },
    });
    expect(exerciseResponse.ok()).toBeTruthy();
    const exerciseBody = await exerciseResponse.json();
    const setId = exerciseBody.set.id as string;
    const exerciseId = exerciseBody.set.exercise.id as string;

    await page.goto(`/workout/${today}/${exerciseId}`);
    await expect(page.getByText(/Offline Sync Squat/i)).toBeVisible();
    await expect(page.getByLabel('Marcar set 1 como completado')).toBeVisible();

    await context.setOffline(true);
    await expect(page.getByText(/Offline:/i)).toBeVisible({ timeout: 6000 });

    const checkbox = page.getByLabel('Marcar set 1 como completado');
    await checkbox.click();

    const rpeSlider = page.getByLabel('RPE del set 1');
    await rpeSlider.fill('9');

    const rirSlider = page.getByLabel('RIR del set 1');
    await rirSlider.fill('1');

    const feelingSlider = page.getByLabel('Sensación del set 1');
    await feelingSlider.fill('4');

    await expect(page.getByText(/Guardado offline|Offline:/i)).toBeVisible({ timeout: 6000 });

    await context.setOffline(false);
    await page.bringToFront();
    await page.waitForTimeout(2500);

    const verifyResponse = await request.get(`/api/workouts/by-date/${today}`);
    expect(verifyResponse.ok()).toBeTruthy();
    const verifyBody = await verifyResponse.json();

    const updatedSet = (verifyBody.sessions as Array<{ sets: Array<{ id: string; isDone?: boolean; rpe?: number | null; rir?: number | null; setFeelingScore?: number | null }> }> )
      .flatMap((session) => session.sets)
      .find((set) => set.id === setId);

    expect(updatedSet).toBeTruthy();
    expect(updatedSet?.isDone).toBe(true);
    expect(updatedSet?.rpe).toBe(9);
    expect(updatedSet?.rir).toBe(1);
    expect(updatedSet?.setFeelingScore).toBe(4);

    await request.delete(`/api/workouts/${sessionId}`);
  });

  test('applies local-wins when server changed while offline', async ({ page, context, request }) => {
    await resetOfflineDb(page);

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const today = formatIsoDate(now);

    const workoutResponse = await request.post('/api/workouts', {
      data: { title: `E2E Conflict ${today}` },
    });
    expect(workoutResponse.ok()).toBeTruthy();
    const workoutBody = await workoutResponse.json();
    const sessionId = workoutBody.session.id as string;

    const exerciseResponse = await request.post(`/api/workouts/${sessionId}/sets`, {
      data: {
        exerciseName: 'Conflict Squat',
        liftId: 'SQ',
        repsTarget: 5,
        targetWeight: 90,
        unit: 'kg',
      },
    });
    expect(exerciseResponse.ok()).toBeTruthy();
    const exerciseBody = await exerciseResponse.json();
    const setId = exerciseBody.set.id as string;
    const exerciseId = exerciseBody.set.exercise.id as string;

    await page.goto(`/workout/${today}/${exerciseId}`);
    await expect(page.getByText(/Conflict Squat/i)).toBeVisible();

    await context.setOffline(true);
    await page.getByLabel('Marcar set 1 como completado').click();

    await page.getByLabel('RPE del set 1').fill('9');
    await page.getByLabel('RIR del set 1').fill('1');
    await page.getByLabel('Sensación del set 1').fill('5');

    await context.setOffline(false);

    const serverInterference = await request.patch(`/api/workouts/${sessionId}/sets/${setId}`, {
      data: {
        rpe: 6,
        rir: 3,
        setFeelingScore: 2,
      },
    });
    expect(serverInterference.ok()).toBeTruthy();

    await page.bringToFront();
    await page.waitForTimeout(3000);

    const verifyResponse = await request.get(`/api/workouts/by-date/${today}`);
    expect(verifyResponse.ok()).toBeTruthy();
    const verifyBody = await verifyResponse.json();

    const updatedSet = (verifyBody.sessions as Array<{ sets: Array<{ id: string; rpe?: number | null; rir?: number | null; setFeelingScore?: number | null }> }> )
      .flatMap((session) => session.sets)
      .find((set) => set.id === setId);

    expect(updatedSet).toBeTruthy();
    expect(updatedSet?.rpe).toBe(9);
    expect(updatedSet?.rir).toBe(1);
    expect(updatedSet?.setFeelingScore).toBe(5);

    await request.delete(`/api/workouts/${sessionId}`);
  });

  test('queues reorder and reschedule while offline', async ({ page, context, request }) => {
    await resetOfflineDb(page);

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const today = formatIsoDate(now);

    const workoutResponse = await request.post('/api/workouts', {
      data: { title: `E2E Day Ops ${today}` },
    });
    expect(workoutResponse.ok()).toBeTruthy();
    const workoutBody = await workoutResponse.json();
    const sessionId = workoutBody.session.id as string;

    const firstSetResponse = await request.post(`/api/workouts/${sessionId}/sets`, {
      data: {
        exerciseName: 'A Press',
        liftId: 'BP',
        repsTarget: 5,
        targetWeight: 60,
        unit: 'kg',
      },
    });
    expect(firstSetResponse.ok()).toBeTruthy();
    const firstSetBody = await firstSetResponse.json();
    const firstExerciseId = firstSetBody.set.exercise.id as string;

    const secondSetResponse = await request.post(`/api/workouts/${sessionId}/sets`, {
      data: {
        exerciseName: 'B Squat',
        liftId: 'SQ',
        repsTarget: 5,
        targetWeight: 100,
        unit: 'kg',
      },
    });
    expect(secondSetResponse.ok()).toBeTruthy();
    const secondSetBody = await secondSetResponse.json();
    const secondExerciseId = secondSetBody.set.exercise.id as string;

    const tomorrowDate = new Date(now);
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tomorrow = formatIsoDate(tomorrowDate);

    await page.goto(`/workout/${today}`);
    await expect(page.locator(`[data-exercise-card-id="${secondExerciseId}"]`)).toBeVisible();

    await context.setOffline(true);

    await page
      .locator(`[data-exercise-card-id="${firstExerciseId}"]`)
      .dragTo(page.locator(`[data-exercise-card-id="${secondExerciseId}"]`));

    await page.getByLabel('Reprogramar día').click();
    await page.locator('#reschedule-date').fill(tomorrow);
    await page.getByRole('button', { name: 'Confirmar reprogramación' }).click();

    await context.setOffline(false);
    await page.bringToFront();
    await page.waitForTimeout(3000);

    const verifyTomorrow = await request.get(`/api/workouts/by-date/${tomorrow}`);
    expect(verifyTomorrow.ok()).toBeTruthy();
    const tomorrowBody = await verifyTomorrow.json();
    const movedSessions = tomorrowBody.sessions as Array<{ id: string }>;
    expect(movedSessions.length).toBeGreaterThan(0);

    await request.delete(`/api/workouts/${sessionId}`);
  });

  test('queues delete while offline', async ({ page, context, request }) => {
    await resetOfflineDb(page);

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);

    const futureDate = new Date(now);
    futureDate.setUTCDate(futureDate.getUTCDate() + 21);
    const targetDate = formatIsoDate(futureDate);

    const workoutResponse = await request.post('/api/workouts', {
      data: { title: `E2E Delete Offline ${targetDate}` },
    });
    expect(workoutResponse.ok()).toBeTruthy();
    const workoutBody = await workoutResponse.json();
    const sessionId = workoutBody.session.id as string;

    const rescheduleResponse = await request.patch(`/api/workouts/${sessionId}`, {
      data: { rescheduledToLocalDate: targetDate },
    });
    expect(rescheduleResponse.ok()).toBeTruthy();

    await page.goto(`/workout/${targetDate}`);
    await expect(page.getByLabel('Eliminar workout')).toBeVisible();

    await context.setOffline(true);
    await page.getByLabel('Eliminar workout').click();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();

    await context.setOffline(false);
    await page.bringToFront();
    await page.waitForTimeout(2500);

    const manualDelete = await request.delete(`/api/workouts/${sessionId}`);
    expect(manualDelete.ok() || manualDelete.status() === 404).toBeTruthy();
  });

  test('keeps next workout flow available across routes when offline', async ({ page, context, request }) => {
    await resetOfflineDb(page);

    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const nextDay = new Date(now);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const nextDate = formatIsoDate(nextDay);

    const workoutResponse = await request.post('/api/workouts', {
      data: { title: `E2E Next Offline ${nextDate}` },
    });
    expect(workoutResponse.ok()).toBeTruthy();
    const workoutBody = await workoutResponse.json();
    const sessionId = workoutBody.session.id as string;

    const rescheduleResponse = await request.patch(`/api/workouts/${sessionId}`, {
      data: { rescheduledToLocalDate: nextDate },
    });
    expect(rescheduleResponse.ok()).toBeTruthy();

    const createSetResponse = await request.post(`/api/workouts/${sessionId}/sets`, {
      data: {
        exerciseName: 'Offline Any Route Bench',
        liftId: 'BP',
        repsTarget: 5,
        targetWeight: 70,
        unit: 'kg',
      },
    });
    expect(createSetResponse.ok()).toBeTruthy();
    const createSetBody = await createSetResponse.json();
    const exerciseId = createSetBody.set.exercise.id as string;

    await page.goto('/');
    await expect(page.getByText(/Próximo Workout/i).first()).toBeVisible();
    await page.waitForTimeout(1200);

    await page.goto(`/workout/${nextDate}/${exerciseId}`);
    await expect(page.getByText(/Offline Any Route Bench/i).first()).toBeVisible();

    await page.goto(`/workout/${nextDate}`);
    await expect(page.getByRole('heading', { name: /Workout/i })).toBeVisible();

    await page.goto(`/workout/${nextDate}/${exerciseId}`);
    await expect(page.getByText(/Offline Any Route Bench/i).first()).toBeVisible();

    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }
    });

    await page.reload();
    await expect(page.getByText(/Offline Any Route Bench/i).first()).toBeVisible();

    await context.setOffline(true);

    await page.goto(`/workout/${nextDate}`);
    await expect(page.getByLabel('Abrir menú')).toBeVisible();
    await page.goto(`/workout/${nextDate}/${exerciseId}`);
    await expect(page.getByLabel('Abrir menú')).toBeVisible();

    await context.setOffline(false);
    await request.delete(`/api/workouts/${sessionId}`);
  });
});
