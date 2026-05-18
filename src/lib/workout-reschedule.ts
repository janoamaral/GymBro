import { db } from "@/lib/db";

type JsonRecord = Record<string, unknown>;

export type WorkoutRescheduleInfo = {
  sessionId: string;
  fromLocalDate: string;
  toLocalDate: string;
  reason: string | null;
  movedAt: string;
};

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseWorkoutRescheduleMetadata(metadata: unknown): WorkoutRescheduleInfo | null {
  const record = asRecord(metadata);
  if (!record) {
    return null;
  }

  const sessionId = asString(record.sessionId);
  const fromLocalDate = asString(record.fromLocalDate);
  const toLocalDate = asString(record.toLocalDate);
  const movedAt = asString(record.movedAt);
  const rawReason = record.reason;
  const reason = rawReason === null ? null : asString(rawReason);

  if (!sessionId || !fromLocalDate || !toLocalDate || !movedAt) {
    return null;
  }

  return {
    sessionId,
    fromLocalDate,
    toLocalDate,
    reason,
    movedAt,
  };
}

export async function getLatestRescheduleInfoBySessionIds(
  userId: string,
  sessionIds: string[],
): Promise<Map<string, WorkoutRescheduleInfo>> {
  if (sessionIds.length === 0) {
    return new Map<string, WorkoutRescheduleInfo>();
  }

  const uniqueSessionIds = new Set(sessionIds);

  const logs = await db.userActivityLog.findMany({
    where: {
      userId,
      action: "WORKOUT_RESCHEDULED",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      metadata: true,
    },
    take: 500,
  });

  const result = new Map<string, WorkoutRescheduleInfo>();

  for (const log of logs) {
    const parsed = parseWorkoutRescheduleMetadata(log.metadata);
    if (!parsed) {
      continue;
    }

    if (!uniqueSessionIds.has(parsed.sessionId)) {
      continue;
    }

    if (!result.has(parsed.sessionId)) {
      result.set(parsed.sessionId, parsed);
    }

    if (result.size === uniqueSessionIds.size) {
      break;
    }
  }

  return result;
}