import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateMeetCoefficients, calculateMeetTotal } from '@/lib/training/meet-coefficients';

test('calculateMeetTotal sums the big three', () => {
  assert.equal(calculateMeetTotal({ squat: 220, bench: 150, deadlift: 260 }), 630);
});

test('calculateMeetCoefficients returns familiar relative scores', () => {
  const result = calculateMeetCoefficients({
    squat: 220,
    bench: 150,
    deadlift: 260,
    bodyweight: 93,
    sex: 'male',
    unit: 'kg',
  });

  assert.equal(result.total, 630);
  assert.equal(result.wilks, 395.76);
  assert.equal(result.wilks2020, 475.28);
  assert.equal(result.dots, 400.84);
});