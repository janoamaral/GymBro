import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { getLatestRescheduleInfoBySessionIds } from "@/lib/workout-reschedule";

function isExerciseOrderUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Unknown argument `exerciseOrder`/i.test(error.message);
}

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
    const localDate = searchParams.get("localDate");

    const fallbackNow = new Date();
    const fallbackDate = {
      year: fallbackNow.getUTCFullYear(),
      month: fallbackNow.getUTCMonth() + 1,
      day: fallbackNow.getUTCDate(),
    };

    const dateParts = localDate ? parseIsoDateParts(localDate) : fallbackDate;

    if (!dateParts) {
      return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
    }

    const dayStart = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 23, 59, 59, 999));

    // Prefer today's unfinished workout in the user's local calendar day.
    const findSessionWithOrder = async (legacyOrder = false) =>
      db.workoutSession.findFirst({
        where: {
          userId: user.id,
          startedAt: {
            gte: dayStart,
            lte: dayEnd,
          },
          finishedAt: null,
        },
        orderBy: {
          startedAt: "asc",
        },
        include: {
          sets: {
            orderBy: legacyOrder ? [{ setNumber: "asc" }] : [{ exerciseOrder: "asc" }, { setNumber: "asc" }],
            include: {
              exercise: true,
            },
          },
        },
      });

    let todaysSession;
    try {
      todaysSession = await findSessionWithOrder(false);
    } catch (error) {
      if (!isExerciseOrderUnsupported(error)) {
        throw error;
      }

      todaysSession = await findSessionWithOrder(true);
    }

    const withReschedule = async <T extends { id: string }>(session: T): Promise<T & { reschedule: unknown }> => {
      const latestReschedules = await getLatestRescheduleInfoBySessionIds(user.id, [session.id]);
      return {
        ...session,
        reschedule: latestReschedules.get(session.id) ?? null,
      };
    };

    if (todaysSession) {
      return NextResponse.json({ session: await withReschedule(todaysSession) });
    }

    const findNextSessionWithOrder = async (legacyOrder = false) =>
      db.workoutSession.findFirst({
        where: {
          userId: user.id,
          startedAt: {
            gt: dayEnd,
          },
          finishedAt: null,
        },
        orderBy: {
          startedAt: "asc",
        },
        include: {
          sets: {
            orderBy: legacyOrder ? [{ setNumber: "asc" }] : [{ exerciseOrder: "asc" }, { setNumber: "asc" }],
            include: {
              exercise: true,
            },
          },
        },
      });

    let session;
    try {
      session = await findNextSessionWithOrder(false);
    } catch (error) {
      if (!isExerciseOrderUnsupported(error)) {
        throw error;
      }

      session = await findNextSessionWithOrder(true);
    }

    if (!session) {
      return NextResponse.json({ session: null });
    }

    return NextResponse.json({ session: await withReschedule(session) });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_NEXT_WORKOUT",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
