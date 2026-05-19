import { roundTo, type WeightUnit } from "@/lib/units/conversion";

export type LiftId = "SQ" | "DL" | "BP";

export type RoundingMode = "nearest" | "up" | "down";

export type WeekNumber = 1 | 2 | 3 | 4;

export type AssistanceVariant = "NONE" | "BBB" | "FSL";

export type PlannedSet = {
  setNumber: number;
  weight: number;
  reps: number;
  percentage: number;
  isAmrap: boolean;
  block: "MAIN" | "ASSISTANCE";
  assistanceVariant?: Exclude<AssistanceVariant, "NONE">;
};

export type WeekDefinition = {
  scheme: [number, number, number];
  percentages: [number, number, number];
  amrapSet: 3 | null;
  label: string;
};

export const WEEK_MATRIX: Record<WeekNumber, WeekDefinition> = {
  1: {
    scheme: [5, 5, 5],
    percentages: [0.65, 0.75, 0.85],
    amrapSet: 3,
    label: "Semana 1 - 5/5/5+",
  },
  2: {
    scheme: [3, 3, 3],
    percentages: [0.7, 0.8, 0.9],
    amrapSet: 3,
    label: "Semana 2 - 3/3/3+",
  },
  3: {
    scheme: [5, 3, 1],
    percentages: [0.75, 0.85, 0.95],
    amrapSet: 3,
    label: "Semana 3 - 5/3/1+",
  },
  4: {
    scheme: [5, 5, 5],
    percentages: [0.4, 0.5, 0.6],
    amrapSet: null,
    label: "Semana 4 - Deload",
  },
};

export function granularityForUnit(unit: WeightUnit): number {
  return unit === "kg" ? 1 : 1;
}

function tmIncrementForLift(liftId: LiftId, unit: WeightUnit): number {
  // SQ y DL incrementan igual, BP igual
  if (liftId === "SQ" || liftId === "DL") {
    return unit === "kg" ? 5 : 10;
  }
  // BP
  return unit === "kg" ? 2.5 : 5;
}

function roundByMode(value: number, step: number, mode: RoundingMode): number {
  const scaled = value / step;

  if (mode === "up") {
    return Math.ceil(scaled) * step;
  }

  if (mode === "down") {
    return Math.floor(scaled) * step;
  }

  return Math.round(scaled) * step;
}

export function roundToGranularity(value: number, unit: WeightUnit, mode: RoundingMode = "nearest"): number {
  const granularity = granularityForUnit(unit);
  return roundByMode(value, granularity, mode);
}

export function calculateTm(oneRm: number, unit: WeightUnit): number {
  if (oneRm <= 0) {
    throw new Error("INVALID_1RM");
  }

  const granularity = granularityForUnit(unit);
  const rounded = roundToGranularity(oneRm, unit, "nearest");
  return Math.max(granularity, roundTo(rounded, 2));
}

export function tmForCycle(oneRm: number, liftId: LiftId, unit: WeightUnit, cycleNumber: number): number {
  if (cycleNumber < 1) {
    throw new Error("INVALID_CYCLE");
  }

  const baseTm = calculateTm(oneRm, unit);
  const increment = tmIncrementForLift(liftId, unit);
  return roundTo(baseTm + increment * (cycleNumber - 1), 2);
}

export function generate531Session(input: {
  tm: number;
  weekNumber: WeekNumber;
  unit: WeightUnit;
  roundingMode?: RoundingMode;
}): PlannedSet[] {
  const { tm, weekNumber, unit, roundingMode = "nearest" } = input;

  if (tm <= 0) {
    throw new Error("INVALID_TM");
  }

  const weekDef = WEEK_MATRIX[weekNumber];

  return weekDef.scheme.map((reps, index) => {
    const percentage = weekDef.percentages[index];
    const rawWeight = tm * percentage;
    const weight = roundToGranularity(rawWeight, unit, roundingMode);
    const setNumber = index + 1;

    return {
      setNumber,
      reps,
      percentage,
      weight,
      isAmrap: weekDef.amrapSet === setNumber,
      block: "MAIN",
    };
  });
}

export function generateBbbSets(input: {
  tm: number;
  unit: WeightUnit;
  percentage?: number;
  setCount?: number;
  reps?: number;
  roundingMode?: RoundingMode;
}): PlannedSet[] {
  const {
    tm,
    unit,
    percentage = 0.5,
    setCount = 5,
    reps = 10,
    roundingMode = "nearest",
  } = input;

  const rawWeight = tm * percentage;
  const weight = roundToGranularity(rawWeight, unit, roundingMode);

  return Array.from({ length: setCount }, (_, index) => ({
    setNumber: index + 1,
    weight,
    reps,
    percentage,
    isAmrap: false,
    block: "ASSISTANCE",
    assistanceVariant: "BBB",
  }));
}

export function generateFslSets(input: {
  mainSets: PlannedSet[];
  setCount?: number;
  reps?: number;
}): PlannedSet[] {
  const { mainSets, setCount = 5, reps = 5 } = input;

  if (mainSets.length === 0) {
    return [];
  }

  const firstSet = mainSets[0];

  return Array.from({ length: setCount }, (_, index) => ({
    setNumber: index + 1,
    weight: firstSet.weight,
    reps,
    percentage: firstSet.percentage,
    isAmrap: false,
    block: "ASSISTANCE",
    assistanceVariant: "FSL",
  }));
}

export function calculateE1rm(weight: number, repsPerformed: number): number {
  if (repsPerformed < 1) {
    throw new Error("INVALID_REPS");
  }

  if (repsPerformed === 1) {
    return roundTo(weight, 2);
  }

  return roundTo(weight * (1 + repsPerformed / 30), 2);
}

export function logAmrap(input: {
  plannedReps: number;
  weight: number;
  repsPerformed: number;
}) {
  const { plannedReps, weight, repsPerformed } = input;

  const e1rm = calculateE1rm(weight, repsPerformed);
  const surplusReps = repsPerformed - plannedReps;

  let status: "EXCEEDED" | "MET" | "MISSED";
  if (surplusReps > 0) {
    status = "EXCEEDED";
  } else if (surplusReps === 0) {
    status = "MET";
  } else {
    status = "MISSED";
  }
  return {
    e1rm,
    repsTarget: plannedReps,
    repsPerformed,
    surplusReps,
    status,
  } as const;
}

export function plan531Week(input: {
  liftId: LiftId;
  oneRm: number;
  unit: WeightUnit;
  weekNumber: WeekNumber;
  cycleNumber?: number;
  roundingMode?: RoundingMode;
  assistanceVariant?: AssistanceVariant;
  bbbPercentage?: number;
}) {
  const {
    liftId,
    oneRm,
    unit,
    weekNumber,
    cycleNumber = 1,
    roundingMode = "nearest",
    assistanceVariant = "NONE",
    bbbPercentage = 0.5,
  } = input;
  const tm = tmForCycle(oneRm, liftId, unit, cycleNumber);
  const sets = generate531Session({ tm, weekNumber, unit, roundingMode });

  let assistanceSets: PlannedSet[] = [];
  if (assistanceVariant === "BBB") {
    assistanceSets = generateBbbSets({
      tm,
      unit,
      percentage: bbbPercentage,
      roundingMode,
    });
  } else if (assistanceVariant === "FSL") {
    assistanceSets = generateFslSets({
      mainSets: sets,
    });
  }

  return {
    liftId,
    cycleNumber,
    weekNumber,
    label: WEEK_MATRIX[weekNumber].label,
    unit,
    tm,
    sets,
    assistanceVariant,
    assistanceSets,
  };
}
