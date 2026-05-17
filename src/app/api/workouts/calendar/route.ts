import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

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

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json({ error: "MISSING_DATE_RANGE" }, { status: 400 });
    }

    const fromParts = parseIsoDateParts(from);
    const toParts = parseIsoDateParts(to);

    if (!fromParts || !toParts) {
      return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
    }

    const fromDate = new Date(Date.UTC(fromParts.year, fromParts.month - 1, fromParts.day, 0, 0, 0, 0));
    const toDate = new Date(Date.UTC(toParts.year, toParts.month - 1, toParts.day, 23, 59, 59, 999));

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
