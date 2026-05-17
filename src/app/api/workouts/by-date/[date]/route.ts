import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

export async function GET(
  request: Request,
  context: { params: Promise<{ date: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { date } = await context.params;

    // Parse date in format YYYY-MM-DD
    const targetDate = new Date(date);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
    }

    // Get start and end of day in UTC
    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

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

    return NextResponse.json({ sessions });
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
