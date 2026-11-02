import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  recalculate531Session,
  type RecalcInputSet,
  type RecalcResult,
} from "@/lib/training/531";

export type SessionRecalculation = RecalcResult & {
  sessionId: string;
  liftId: "SQ" | "DL" | "BP";
  unit: "kg" | "lb";
};

function dateRange(date: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const start = new Date(Date.UTC(year, month - 1, day));

  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== day
  ) {
    return null;
  }

  return { start, end: new Date(start.getTime() + 86_400_000 - 1) };
}

export async function getSessionRecalculation(
  userId: string,
  date: string,
): Promise<SessionRecalculation | null> {
  const range = dateRange(date);
  if (!range) throw new Error("INVALID_DATE_FORMAT");

  const session = await db.workoutSession.findFirst({
    where: {
      userId,
      startedAt: { gte: range.start, lte: range.end },
      sets: { some: { liftId: { not: null } } },
    },
    include: {
      sets: {
        where: { liftId: { not: null } },
        orderBy: [{ exerciseOrder: "asc" }, { setNumber: "asc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  if (!session || session.recalculationVersion !== null) return null;

  const firstLiftSet = session.sets.find((set) => set.liftId !== null);
  if (!firstLiftSet?.liftId) return null;

  const liftId = firstLiftSet.liftId;
  const sessionSets = session.sets.filter((set) => set.liftId === liftId);
  const historyStart = new Date(range.start.getTime() - 21 * 86_400_000);
  const history = await db.exerciseSet.findMany({
    where: {
      liftId,
      session: {
        userId,
        startedAt: { gte: historyStart, lt: range.start },
      },
    },
    include: {
      session: { select: { id: true, feelingScore: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const originalSets: RecalcInputSet[] = sessionSets.map((set) => ({
    id: set.id,
    setNumber: set.setNumber,
    weight: Number(set.targetWeight),
    reps: set.repsTarget,
    percentage: Number(set.percentage ?? 0),
    isAmrap: set.isAmrap,
    block: set.percentage == null ? "ASSISTANCE" : "MAIN",
  }));

  const result = recalculate531Session({
    originalSets,
    historySets: history.map((set) => ({
      sessionId: set.sessionId,
      repsTarget: set.repsTarget,
      repsDone: set.repsDone,
      rir: set.rir,
      e1rm: set.e1rm == null ? null : Number(set.e1rm),
      percentage: Number(set.percentage ?? 0),
      block: set.percentage == null ? "ASSISTANCE" : "MAIN",
      isCancelled: set.isCancelled,
      cancelReasonCode: set.cancelReasonCode,
    })),
    feelingHistory: Array.from(
      new Map(history.map((set) => [set.session.id, set.session.feelingScore])).values(),
      (feelingScore) => ({ feelingScore }),
    ),
  });

  return {
    ...result,
    sessionId: session.id,
    liftId,
    unit: firstLiftSet.unit,
  };
}

function serializeSet(set: {
  id: string;
  exerciseId: string;
  exerciseOrder: number;
  liftId: "SQ" | "DL" | "BP" | null;
  setNumber: number;
  repsTarget: number;
  targetWeight: unknown;
  percentage: unknown;
  isAmrap: boolean;
  unit: "kg" | "lb";
}) {
  return {
    id: set.id,
    exerciseId: set.exerciseId,
    exerciseOrder: set.exerciseOrder,
    liftId: set.liftId,
    setNumber: set.setNumber,
    repsTarget: set.repsTarget,
    targetWeight: Number(set.targetWeight),
    percentage: set.percentage == null ? null : Number(set.percentage),
    isAmrap: set.isAmrap,
    unit: set.unit,
  };
}

export async function snapshotOriginal(
  tx: Prisma.TransactionClient,
  userId: string,
  recalculation: SessionRecalculation,
): Promise<void> {
  const session = await tx.workoutSession.findFirst({
    where: { id: recalculation.sessionId, userId },
    include: { sets: { orderBy: [{ exerciseOrder: "asc" }, { setNumber: "asc" }] } },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND");

  await tx.workoutSession.update({
    where: { id: session.id },
    data: {
      originalPlan: session.originalPlan ?? session.sets.map(serializeSet),
      recalculatedPlan: recalculation.suggestedSets,
      recalcReason: recalculation.reasons.join("; "),
    },
  });
}
