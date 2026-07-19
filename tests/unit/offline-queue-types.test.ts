import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { QueueMutation } from '../../src/lib/offline-queue';

describe('offline queue types', () => {
  it('supports set_update payload shape', () => {
    const mutation: QueueMutation = {
      id: 'm1',
      type: 'set_update',
      targetId: 'set-1',
      endpoint: '/api/workouts/s1/sets/set-1',
      method: 'PATCH',
      payload: {
        isDone: true,
        rpe: 8,
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
    };

    assert.equal(mutation.type, 'set_update');
  });

  it('supports set_update payload with unit', () => {
    const mutation: QueueMutation = {
      id: 'm2',
      type: 'set_update',
      targetId: 'set-2',
      endpoint: '/api/workouts/s1/sets/set-2',
      method: 'PATCH',
      payload: {
        targetWeight: 22,
        unit: 'lb',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
    };

    assert.equal(mutation.payload.unit, 'lb');
  });

  it('supports reorder payload shape', () => {
    const mutation: QueueMutation = {
      id: 'm2',
      type: 'reorder_exercises',
      targetId: '2026-05-21',
      endpoint: '/api/workouts/by-date/2026-05-21',
      method: 'PATCH',
      payload: {
        orderedExerciseIds: ['a', 'b'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attempts: 0,
    };

    assert.equal(mutation.method, 'PATCH');
  });
});
