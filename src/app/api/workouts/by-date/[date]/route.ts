import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { getLatestRescheduleInfoBySessionIds } from "@/lib/workout-reschedule";

function parseIsoDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ date: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { date } = await context.params;

    const dateParts = parseIsoDateParts(date);
    if (!dateParts) {
      return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
    }

    // Query the exact UTC calendar day represented by YYYY-MM-DD.
    const dayStart = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 23, 59, 59, 999));

    const sessions = await db.workoutSession.findMany({
      where: {
        userId: user.id,
        startedAt: {
          gte: dayStart,
          lte: dayEnd,
        },
      },
      include: {
        sets: {
          orderBy: { setNumber: "asc" },
          include: {
            exercise: true,
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const sessionIds = sessions.map((session) => session.id);
    const latestReschedules = await getLatestRescheduleInfoBySessionIds(user.id, sessionIds);

    const sessionsWithReschedule = sessions.map((session) => ({
      ...session,
      reschedule: latestReschedules.get(session.id) ?? null,
    }));

    return NextResponse.json({ sessions: sessionsWithReschedule });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_SESSIONS_BY_DATE",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
