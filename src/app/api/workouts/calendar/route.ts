import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "MISSING_DATE_RANGE" }, { status: 400 });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
    }

    // Get all sessions in the date range for this user
    const sessions = await db.workoutSession.findMany({
      where: {
        userId: user.id,
        startedAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
      select: {
        startedAt: true,
      },
    });

    // Count sessions per date (YYYY-MM-DD format)
    const dateMap = new Map<string, number>();
    sessions.forEach((session) => {
      const dateStr = session.startedAt.toISOString().split("T")[0];
      dateMap.set(dateStr, (dateMap.get(dateStr) || 0) + 1);
    });

    const result = Array.from(dateMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    return NextResponse.json({ dates: result });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_CALENDAR",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
