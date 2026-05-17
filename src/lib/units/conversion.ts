export type WeightUnit = "kg" | "lb";

const KG_TO_LB = 2.2046226218;

export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) {
    return value;
  }

  if (from === "kg" && to === "lb") {
    return value * KG_TO_LB;
  }

  return value / KG_TO_LB;
}

export function roundTo(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function formatDualWeight(mainValue: number, mainUnit: WeightUnit): {
  mainText: string;
  secondaryText: string;
} {
  const secondaryUnit = mainUnit === "kg" ? "lb" : "kg";
  const secondaryValue = roundTo(convertWeight(mainValue, mainUnit, secondaryUnit), 1);

  return {
    mainText: `${roundTo(mainValue, 1)} ${mainUnit}`,
    secondaryText: `${secondaryValue} ${secondaryUnit}`,
  };
}
