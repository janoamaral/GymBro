import { roundTo, type WeightUnit } from "@/lib/units/conversion";

export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;
export const STANDARD_PLATES_LB = [45, 35, 25, 10, 5, 2.5, 1.25] as const;

export type BarbellCalculationInput = {
  targetWeight: number;
  barbellWeight: number;
  unit: WeightUnit;
  roundingMode?: "up" | "nearest" | "down";
};

export type BarbellCalculationResult = {
  perSide: number;
  roundedPerSide: number;
  totalFromBarAndPlates: number;
  differenceFromTarget: number;
  unit: WeightUnit;
};

function granularityForUnit(unit: WeightUnit): number {
  return standardTotalStepForUnit(unit);
}

export function standardPlatesForUnit(unit: WeightUnit): number[] {
  return (unit === "kg" ? [...STANDARD_PLATES_KG] : [...STANDARD_PLATES_LB]).sort((a, b) => b - a);
}

export function standardTotalStepForUnit(unit: WeightUnit): number {
  const plates = standardPlatesForUnit(unit);
  const smallestPlate = plates[plates.length - 1];
  return roundTo(smallestPlate * 2, 2);
}

function roundByMode(value: number, step: number, mode: "up" | "nearest" | "down"): number {
  const scaled = value / step;

  if (mode === "up") {
    return Math.ceil(scaled) * step;
  }

  if (mode === "down") {
    return Math.floor(scaled) * step;
  }

  return Math.round(scaled) * step;
}

export function calculatePlateLoadPerSide(input: BarbellCalculationInput): BarbellCalculationResult {
  const { targetWeight, barbellWeight, unit, roundingMode = "up" } = input;

  if (targetWeight <= 0) {
    throw new Error("TARGET_WEIGHT_MUST_BE_POSITIVE");
  }

  if (barbellWeight <= 0) {
    throw new Error("BARBELL_WEIGHT_MUST_BE_POSITIVE");
  }

  if (targetWeight < barbellWeight) {
    throw new Error("TARGET_WEIGHT_BELOW_BARBELL");
  }

  const rawPerSide = (targetWeight - barbellWeight) / 2;
  const perSideStep = granularityForUnit(unit) / 2;
  const roundedPerSide = roundByMode(rawPerSide, perSideStep, roundingMode);

  const totalFromBarAndPlates = barbellWeight + rawPerSide * 2;
  const differenceFromTarget = totalFromBarAndPlates - targetWeight;

  return {
    perSide: roundTo(rawPerSide, 2),
    roundedPerSide: roundTo(roundedPerSide, 2),
    totalFromBarAndPlates: roundTo(totalFromBarAndPlates, 2),
    differenceFromTarget: roundTo(differenceFromTarget, 2),
    unit,
  };
}

export function suggestPlatesPerSide(
  perSideWeight: number,
  unit: WeightUnit,
  availablePlates?: number[],
): number[] {
  const plates = (availablePlates ?? standardPlatesForUnit(unit)).slice().sort((a, b) => b - a);
  const result: number[] = [];
  let remaining = perSideWeight;

  for (const plate of plates) {
    while (remaining + 1e-9 >= plate) {
      result.push(plate);
      remaining = roundTo(remaining - plate, 4);
    }
  }

  return result;
}
