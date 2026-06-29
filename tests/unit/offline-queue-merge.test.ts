import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSetPatchesIntoSessions } from '../../src/lib/offline-queue';

describe('mergeSetPatchesIntoSessions', () => {
  it('patches matching sets by id without rearranging', () => {
    const sessions = [
      {
        id: 'sess-1',
        sets: [
          { id: 'set-a', isDone: false, repsTarget: 5, exerciseOrder: 0 },
          { id: 'set-b', isDone: false, repsTarget: 5, exerciseOrder: 0 },
        ],
      },
    ];

    const result = mergeSetPatchesIntoSessions(sessions, [
      { id: 'set-a', isDone: true },
    ]);

    assert.equal(result.touched, true);
    assert.deepEqual(result.sessions, [
      {
        id: 'sess-1',
        sets: [
          { id: 'set-a', isDone: true, repsTarget: 5, exerciseOrder: 0 },
          { id: 'set-b', isDone: false, repsTarget: 5, exerciseOrder: 0 },
        ],
      },
    ]);
    assert.equal(sessions[0].sets[0].isDone, false, 'input not mutated');
  });

  it('reports untouched when no patches match', () => {
    const sessions = [{ id: 's', sets: [{ id: 'x', isDone: false }] }];
    const result = mergeSetPatchesIntoSessions(sessions, [{ id: 'nope', isDone: true }]);
    assert.equal(result.touched, false);
    assert.equal(result.sessions, sessions);
  });

  it('handles empty patch list without scanning', () => {
    const sessions = [{ id: 's', sets: [{ id: 'x', isDone: false }] }];
    const result = mergeSetPatchesIntoSessions(sessions, []);
    assert.equal(result.touched, false);
    assert.equal(result.sessions, sessions);
  });
});