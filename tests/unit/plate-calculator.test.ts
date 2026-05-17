import test from "node:test";
import assert from "node:assert/strict";
import { calculatePlateLoadPerSide, suggestPlatesPerSide } from "@/lib/training/plate-calculator";

test("calculates 120kg target with 18kg bar as 51kg per side", () => {
  const result = calculatePlateLoadPerSide({
    targetWeight: 120,
    barbellWeight: 18,
    unit: "kg",
    roundingMode: "nearest",
  });

  assert.equal(result.perSide, 51);
  assert.equal(result.totalFromBarAndPlates, 120);
  assert.equal(result.differenceFromTarget, 0);
});

test("rounds up by default when value does not fit granularity", () => {
  const result = calculatePlateLoadPerSide({
    targetWeight: 121,
    barbellWeight: 20,
    unit: "kg",
  });

  assert.equal(result.perSide, 50.5);
  assert.equal(result.roundedPerSide, 51.25);
  assert.equal(result.totalFromBarAndPlates, 121);
});

test("throws when target is below barbell", () => {
  assert.throws(
    () => calculatePlateLoadPerSide({ targetWeight: 15, barbellWeight: 20, unit: "kg" }),
    /TARGET_WEIGHT_BELOW_BARBELL/,
  );
});

test("suggests sane plates for a per-side load", () => {
  const result = suggestPlatesPerSide(51.25, "kg");

  assert.deepEqual(result, [25, 25, 1.25]);
});
