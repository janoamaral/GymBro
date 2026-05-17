import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateE1rm,
  calculateTm,
  generateBbbSets,
  generateFslSets,
  logAmrap,
  plan531Week,
  roundToGranularity,
  tmForCycle,
} from "@/lib/training/531";

test("calculateTm rounds 1RM using unit granularity", () => {
  assert.equal(calculateTm(150, "kg"), 150);
  assert.equal(calculateTm(315, "lb"), 315);
});

test("tmForCycle applies per-lift increment each cycle", () => {
  const cycle1 = tmForCycle(150, "SQ", "kg", 1);
  const cycle2 = tmForCycle(150, "SQ", "kg", 2);
  const cycle3 = tmForCycle(150, "BP", "kg", 3);

  assert.equal(cycle1, 150);
  assert.equal(cycle2, 155);
  assert.equal(cycle3, 155);
});

test("plan531Week builds week 1 with AMRAP on set 3", () => {
  const plan = plan531Week({
    liftId: "SQ",
    oneRm: 160,
    unit: "kg",
    weekNumber: 1,
    cycleNumber: 1,
  });

  assert.equal(plan.tm, 160);
  assert.equal(plan.sets.length, 3);
  assert.equal(plan.sets[2].isAmrap, true);
});

test("roundToGranularity can round up/down/nearest", () => {
  assert.equal(roundToGranularity(83.1, "kg", "nearest"), 83);
  assert.equal(roundToGranularity(83.1, "kg", "up"), 84);
  assert.equal(roundToGranularity(83.1, "kg", "down"), 83);

  assert.equal(roundToGranularity(182.6, "lb", "nearest"), 183);
  assert.equal(roundToGranularity(182.6, "lb", "up"), 183);
  assert.equal(roundToGranularity(182.6, "lb", "down"), 182);
});

test("e1rm and amrap logging follows expected status", () => {
  assert.equal(calculateE1rm(100, 6), 120);

  const exceeded = logAmrap({ plannedReps: 3, weight: 100, repsPerformed: 7 });
  const missed = logAmrap({ plannedReps: 5, weight: 100, repsPerformed: 4 });

  assert.equal(exceeded.status, "EXCEEDED");
  assert.equal(exceeded.surplusReps, 4);
  assert.equal(missed.status, "MISSED");
});

test("BBB and FSL assistance generation", () => {
  const bbb = generateBbbSets({ tm: 140, unit: "kg" });
  assert.equal(bbb.length, 5);
  assert.equal(bbb[0].reps, 10);
  assert.equal(bbb[0].block, "ASSISTANCE");
  assert.equal(bbb[0].assistanceVariant, "BBB");

  const main = plan531Week({
    liftId: "BP",
    oneRm: 120,
    unit: "kg",
    weekNumber: 2,
  }).sets;
  const fsl = generateFslSets({ mainSets: main });
  assert.equal(fsl.length, 5);
  assert.equal(fsl[0].weight, main[0].weight);
  assert.equal(fsl[0].reps, 5);
  assert.equal(fsl[0].assistanceVariant, "FSL");
});

test("plan531Week can include assistance sets", () => {
  const withBbb = plan531Week({
    liftId: "SQ",
    oneRm: 170,
    unit: "kg",
    weekNumber: 1,
    assistanceVariant: "BBB",
  });

  const withFsl = plan531Week({
    liftId: "SQ",
    oneRm: 170,
    unit: "kg",
    weekNumber: 1,
    assistanceVariant: "FSL",
  });

  assert.equal(withBbb.assistanceSets.length, 5);
  assert.equal(withBbb.assistanceVariant, "BBB");
  assert.equal(withFsl.assistanceSets.length, 5);
  assert.equal(withFsl.assistanceVariant, "FSL");
});
