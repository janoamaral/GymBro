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

// ---------------------------------------------------------------------------
// Recálculo dinámico 5/3/1
//
// Función pura: toma el plan original de una sesión y el historial reciente
// del mismo lift, y devuelve una propuesta recalculada con nivel de ajuste y
// motivos legibles. No accede a DB ni al estado global. Los umbrales viven en
// RECALC_THRESHOLDS, el knob de calibración del mundo real.
// ---------------------------------------------------------------------------

export type RecalcLevel =
  | "Sin cambios"
  | "Leve"
  | "Moderado"
  | "Agresivo"
  | "Por debajo"
  | "Conservador";

export type RecalcInputSet = {
  setNumber: number;
  weight: number;
  reps: number;
  percentage: number;
  isAmrap: boolean;
  block: "MAIN" | "ASSISTANCE";
};

export type RecalcHistorySet = {
  repsTarget: number;
  repsDone: number | null;
  rir: number | null;
  percentage: number;
  block: "MAIN" | "ASSISTANCE";
  isCancelled: boolean;
  cancelReasonCode: number | null;
};

export type RecalcFeelingEntry = {
  feelingScore: number | null;
};

export type RecalcSignal = {
  repPerformance: number; // media de repsDone/repsTarget en sets no cancelados
  rirTrend: number | null; // media de rir en top sets, null si no hay datos
  feelingTrend: number | null; // media de feelingScore, null si no hay datos
  blockFatigue: number; // sets cancelados por cansancio / sets totales del bloque
  sessionsCount: number; // sesiones de historial usadas
};

export type RecalcSuggestedSet = RecalcInputSet & {
  repsTarget: number;
  targetWeight: number;
};

export type RecalcResult = {
  level: RecalcLevel;
  suggestedSets: RecalcSuggestedSet[];
  reasons: string[];
  signal: RecalcSignal;
  originalSets: RecalcInputSet[];
};

export const RECALC_THRESHOLDS = {
  // Cumplimiento de repeticiones
  repPerformanceJusto: 0.05, // |repPerformance - 1| < esto = "justo"
  repPerformanceMejorandoLeve: 1.05,
  repPerformanceMejorandoClaro: 1.15,
  repPerformanceBajo: 0.9,
  // RIR
  rirJustoMin: 1,
  rirJustoMax: 3,
  rirProgresionMin: 2,
  rirSostenido: 3,
  // Feeling
  feelingOkMin: 3,
  feelingSobrecumplidoMin: 4,
  feelingFatigaMax: 2,
  // Fatiga del bloque
  blockFatigueBajo: 0.1,
  blockFatigueAlto: 0.25,
  // Ajustes de carga (% sobre el peso del set original)
  levePesoPorcentaje: 0.025,
  moderadoPesoPorcentaje: 0.05,
  bajoPesoPorcentaje: -0.05,
  // Reps extra al AMRAP cuando el usuario sobrecumple agresivamente
  agresivoRepsExtraAmrap: 1,
  // Historial mínimo para confiar en el recálculo
  minSessionsHistorial: 3,
  // Delta mínimo para destacar una diferencia en UI (1%)
  uiDeltaMinimo: 0.01,
} as const;

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function computeSignal(
  history: RecalcHistorySet[],
  feelingHistory: RecalcFeelingEntry[],
): RecalcSignal {
  const usable = history.filter((s) => !s.isCancelled && s.repsDone != null);
  const repPerformanceRaw = mean(
    usable
      .filter((s) => s.repsTarget > 0)
      .map((s) => (s.repsDone as number) / s.repsTarget),
  );
  const repPerformance = repPerformanceRaw ?? 1;

  // RIR: top sets = MAIN sets con mayor percentage de cada sesión conceptual.
  // Aquí simplificamos a MAIN sets no cancelados con rir reportado.
  const rirValues = usable
    .filter((s) => s.block === "MAIN" && s.rir != null)
    .map((s) => s.rir as number);
  const rirTrend = mean(rirValues);

  const feelingValues = feelingHistory
    .map((f) => f.feelingScore)
    .filter((v): v is number => v != null);
  const feelingTrend = mean(feelingValues);

  const totalSets = history.length;
  const cancelledFatigue = history.filter(
    (s) => s.isCancelled && s.cancelReasonCode === 1,
  ).length;
  const blockFatigue = totalSets > 0 ? cancelledFatigue / totalSets : 0;

  // sessionsCount = sesiones distintas conceptualmente; aproximamos con
  // (sets de MAIN / 3) ya que 5/3/1 son 3 sets por sesión principal.
  const mainSets = history.filter((s) => s.block === "MAIN").length;
  const sessionsCount = Math.max(1, Math.round(mainSets / 3));

  return { repPerformance, rirTrend, feelingTrend, blockFatigue, sessionsCount };
}

function clampWeight(value: number): number {
  return Math.max(0, Number(value.toFixed(2)));
}

export function computeRecalcSignal(
  history: RecalcHistorySet[],
  feelingHistory: RecalcFeelingEntry[],
): RecalcSignal {
  return computeSignal(history, feelingHistory);
}

export function recalculate531Session(input: {
  originalSets: RecalcInputSet[];
  historySets: RecalcHistorySet[];
  feelingHistory: RecalcFeelingEntry[];
}): RecalcResult {
  const { originalSets, historySets, feelingHistory } = input;
  const signal = computeSignal(historySets, feelingHistory);
  const T = RECALC_THRESHOLDS;

  const reasons: string[] = [];
  const sig = (label: string, value: number | null, fixed = 2): string =>
    `${label} ${value != null ? value.toFixed(fixed) : "n/a"}`;

  const originalAsSuggested = (): RecalcSuggestedSet[] =>
    originalSets.map((s) => ({
      ...s,
      repsTarget: s.reps,
      targetWeight: s.weight,
    }));

  // Historial insuficiente → sin cambios
  if (signal.sessionsCount < T.minSessionsHistorial) {
    return {
      level: "Sin cambios",
      suggestedSets: originalAsSuggested(),
      reasons: ["historial insuficiente"],
      signal,
      originalSets,
    };
  }

  const { repPerformance, rirTrend, feelingTrend, blockFatigue } = signal;
  const fatigaAlta =
    blockFatigue > T.blockFatigueAlto ||
    (feelingTrend != null && feelingTrend < T.feelingFatigaMax);
  const rirOk =
    rirTrend != null && rirTrend >= T.rirJustoMin && rirTrend <= T.rirJustoMax;
  const feelingOk = feelingTrend == null || feelingTrend >= T.feelingOkMin;
  const fatigaBaja = blockFatigue < T.blockFatigueBajo;

  // Caso "Por debajo": repPerformance bajo, sin importar fatiga
  if (repPerformance < T.repPerformanceBajo) {
    const reasonsBelow = [
      sig("repPerformance", repPerformance),
      "por debajo del objetivo",
    ];
    const suggested = applyAdjustment(originalSets, {
      weightPorcentaje: T.bajoPesoPorcentaje,
      drop_backoff_sets: 1,
    });
    reasons.push(...reasonsBelow, "reducir carga y 1 set de backoff");
    return { level: "Por debajo", suggestedSets: suggested, reasons, signal, originalSets };
  }

  // Fatiga alta: prioridad a reducir volumen
  if (fatigaAlta) {
    const reasonsFatiga = [
      sig("blockFatigue", blockFatigue),
      sig("feelingTrend", feelingTrend),
      "fatiga alta del bloque",
    ];
    const suggested = applyAdjustment(originalSets, {
      drop_backoff_sets: 1,
    });
    reasons.push(...reasonsFatiga, "priorizar reducción de volumen, sin progresión");
    return { level: "Conservador", suggestedSets: suggested, reasons, signal, originalSets };
  }

  // Mejorando: clasificar por intensidad
  const mejorandoLeve = repPerformance > T.repPerformanceMejorandoLeve &&
    (rirTrend == null || rirTrend >= T.rirProgresionMin) &&
    feelingOk &&
    fatigaBaja;

  const mejorandoClaro =
    repPerformance > T.repPerformanceMejorandoClaro ||
    (rirTrend != null && rirTrend >= T.rirSostenido && repPerformance > 1);

  const sobrecumpliendoAgresivo =
    repPerformance > T.repPerformanceMejorandoClaro &&
    (rirTrend != null && rirTrend >= T.rirSostenido) &&
    (feelingTrend == null || feelingTrend >= T.feelingSobrecumplidoMin) &&
    fatigaBaja;

  if (sobrecumpliendoAgresivo) {
    const suggested = applyAdjustment(originalSets, {
      weightPorcentaje: T.moderadoPesoPorcentaje,
      amrapRepsExtra: T.agresivoRepsExtraAmrap,
    });
    reasons.push(
      sig("repPerformance", repPerformance),
      sig("rirTrend", rirTrend),
      sig("feelingTrend", feelingTrend),
      "sobrecumpliendo con fatiga baja: subir peso y 1 rep al AMRAP",
    );
    return { level: "Agresivo", suggestedSets: suggested, reasons, signal, originalSets };
  }

  if (mejorandoClaro) {
    const suggested = applyAdjustment(originalSets, {
      weightPorcentaje: T.moderadoPesoPorcentaje,
    });
    reasons.push(
      sig("repPerformance", repPerformance),
      sig("rirTrend", rirTrend),
      "mejorando claro: subir peso 5%",
    );
    return { level: "Moderado", suggestedSets: suggested, reasons, signal, originalSets };
  }

  if (mejorandoLeve) {
    const suggested = applyAdjustment(originalSets, {
      weightPorcentaje: T.levePesoPorcentaje,
    });
    reasons.push(
      sig("repPerformance", repPerformance),
      sig("rirTrend", rirTrend),
      "mejorando estable: subir peso 2.5%",
    );
    return { level: "Leve", suggestedSets: suggested, reasons, signal, originalSets };
  }

  // Caso "justo" → sin cambios
  const justo = Math.abs(repPerformance - 1) < T.repPerformanceJusto &&
    (rirOk || rirTrend == null) &&
    feelingOk &&
    fatigaBaja;

  if (justo) {
    reasons.push(
      sig("repPerformance", repPerformance),
      "cumplimiento justo",
      rirTrend == null ? "sin RIR reportado" : sig("rirTrend", rirTrend),
    );
  } else {
    reasons.push(
      sig("repPerformance", repPerformance),
      "señales mixtas, mantener plan original",
    );
  }

  return {
    level: "Sin cambios",
    suggestedSets: originalAsSuggested(),
    reasons,
    signal,
    originalSets,
  };
}

function applyAdjustment(
  originalSets: RecalcInputSet[],
  opts: {
    weightPorcentaje?: number;
    amrapRepsExtra?: number;
    drop_backoff_sets?: number;
  },
): RecalcSuggestedSet[] {
  const { weightPorcentaje = 0, amrapRepsExtra = 0, drop_backoff_sets = 0 } = opts;

  const mainSets = originalSets.filter((s) => s.block === "MAIN");
  const assistanceSets = originalSets.filter((s) => s.block === "ASSISTANCE");

  const adjustedMain = mainSets.map((s) => {
    const newWeight = clampWeight(s.weight * (1 + weightPorcentaje));
    const newReps = s.isAmrap ? s.reps + amrapRepsExtra : s.reps;
    return {
      ...s,
      weight: newWeight,
      reps: newReps,
      repsTarget: newReps,
      targetWeight: newWeight,
    };
  });

  // Backoff/accesorios: si hay que tirar sets, quitamos del final (últimos BBB/FSL).
  const trimmedAssistance =
    drop_backoff_sets > 0
      ? assistanceSets.slice(0, Math.max(0, assistanceSets.length - drop_backoff_sets))
      : assistanceSets;

  const adjustedAssistance = trimmedAssistance.map((s) => {
    const newWeight = clampWeight(s.weight * (1 + weightPorcentaje));
    return {
      ...s,
      weight: newWeight,
      repsTarget: s.reps,
      targetWeight: newWeight,
    };
  });

  return [...adjustedMain, ...adjustedAssistance];
}
