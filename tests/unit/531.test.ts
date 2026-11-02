import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateE1rm,
  calculateTm,
  generateBbbSets,
  generateFslSets,
  logAmrap,
  plan531Week,
  recalculate531Session,
  roundToGranularity,
  tmForCycle,
  type RecalcHistorySet,
  type RecalcInputSet,
} from "@/lib/training/531";

const originalRecalcSets: RecalcInputSet[] = [
  { setNumber: 1, weight: 80, reps: 5, percentage: 0.65, isAmrap: false, block: "MAIN" },
  { setNumber: 2, weight: 90, reps: 5, percentage: 0.75, isAmrap: false, block: "MAIN" },
  { setNumber: 3, weight: 100, reps: 5, percentage: 0.85, isAmrap: true, block: "MAIN" },
  { setNumber: 4, weight: 60, reps: 10, percentage: 0.5, isAmrap: false, block: "ASSISTANCE" },
];

function history(options: {
  repsDone: number;
  repsTarget?: number;
  rir?: number | null;
  cancelledPerSession?: boolean;
  sessions?: number;
}): RecalcHistorySet[] {
  const sessions = options.sessions ?? 3;
  return Array.from({ length: sessions }, (_, sessionIndex) =>
    Array.from({ length: 3 }, (_, setIndex): RecalcHistorySet => ({
      sessionId: `session-${sessionIndex}`,
      repsTarget: options.repsTarget ?? 10,
      repsDone: options.repsDone,
      rir: options.rir ?? null,
      percentage: 0.65 + setIndex * 0.1,
      block: "MAIN",
      isCancelled: Boolean(options.cancelledPerSession && setIndex === 0),
      cancelReasonCode: options.cancelledPerSession && setIndex === 0 ? 1 : null,
    })),
  ).flat();
}

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

test("recalculation keeps the original plan without enough sessions", () => {
  const result = recalculate531Session({
    originalSets: originalRecalcSets,
    historySets: history({ repsDone: 11, rir: 3, sessions: 2 }),
    feelingHistory: [{ feelingScore: 5 }, { feelingScore: 5 }],
  });

  assert.equal(result.level, "Sin cambios");
  assert.deepEqual(result.reasons, ["historial insuficiente"]);
  assert.equal(result.suggestedSets[2].targetWeight, 100);
});

test("recalculation applies a light increase only to the top set", () => {
  const result = recalculate531Session({
    originalSets: originalRecalcSets,
    historySets: history({ repsDone: 11, rir: 2 }),
    feelingHistory: Array(3).fill({ feelingScore: 3 }),
  });

  assert.equal(result.level, "Leve");
  assert.equal(result.suggestedSets[0].targetWeight, 80);
  assert.equal(result.suggestedSets[2].targetWeight, 102.5);
  assert.equal(result.suggestedSets[3].targetWeight, 60);
});

test("recalculation applies a moderate increase to the planned load", () => {
  const result = recalculate531Session({
    originalSets: originalRecalcSets,
    historySets: history({ repsDone: 12, rir: 2 }),
    feelingHistory: Array(3).fill({ feelingScore: 3 }),
  });

  assert.equal(result.level, "Moderado");
  assert.equal(result.suggestedSets[0].targetWeight, 84);
  assert.equal(result.suggestedSets[3].targetWeight, 63);
});

test("recalculation applies an aggressive top-set progression", () => {
  const result = recalculate531Session({
    originalSets: originalRecalcSets,
    historySets: history({ repsDone: 12, rir: 3 }),
    feelingHistory: Array(3).fill({ feelingScore: 4 }),
  });

  assert.equal(result.level, "Agresivo");
  assert.equal(result.suggestedSets[2].targetWeight, 105);
  assert.equal(result.suggestedSets[2].repsTarget, 6);
  assert.equal(result.suggestedSets[0].targetWeight, 80);
});

test("recalculation lowers load and backoff volume when performance is low", () => {
  const result = recalculate531Session({
    originalSets: originalRecalcSets,
    historySets: history({ repsDone: 8, rir: 1 }),
    feelingHistory: Array(3).fill({ feelingScore: 3 }),
  });

  assert.equal(result.level, "Moderado");
  assert.equal(result.suggestedSets[0].targetWeight, 76);
  assert.equal(result.suggestedSets.length, 3);
  assert.match(result.reasons.join(" "), /por debajo/);
});

test("recalculation reduces volume on high fatigue and tolerates missing metrics", () => {
  const fatigued = recalculate531Session({
    originalSets: originalRecalcSets,
    historySets: history({ repsDone: 10, cancelledPerSession: true }),
    feelingHistory: Array(3).fill({ feelingScore: null }),
  });
  const incomplete = recalculate531Session({
    originalSets: originalRecalcSets,
    historySets: history({ repsDone: 10 }),
    feelingHistory: Array(3).fill({ feelingScore: null }),
  });

  assert.equal(fatigued.level, "Agresivo");
  assert.equal(fatigued.suggestedSets.length, 3);
  assert.match(fatigued.reasons.join(" "), /fatiga alta/);
  assert.equal(incomplete.level, "Sin cambios");
});
