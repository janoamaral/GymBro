import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { getLatestRescheduleInfoBySessionIds } from "@/lib/workout-reschedule";

const reorderExercisesSchema = z.object({
  orderedExerciseIds: z.array(z.string().min(1)).min(1),
});

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

    let sessions;

    try {
      sessions = await db.workoutSession.findMany({
        where: {
          userId: user.id,
          startedAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        include: {
          sets: {
            orderBy: [{ exerciseOrder: "asc" }, { setNumber: "asc" }],
            include: {
              exercise: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    } catch (error) {
      if (!isExerciseOrderUnsupported(error)) {
        throw error;
      }

      sessions = await db.workoutSession.findMany({
        where: {
          userId: user.id,
          startedAt: {
            gte: dayStart,
            lte: dayEnd,
          },
        },
        include: {
          sets: {
            orderBy: [{ setNumber: "asc" }],
            include: {
              exercise: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }

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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ date: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { date } = await context.params;
    const body = await request.json();
    const payload = reorderExercisesSchema.parse(body);

    const dateParts = parseIsoDateParts(date);
    if (!dateParts) {
      return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
    }

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
      select: {
        id: true,
      },
    });

    const sessionIds = sessions.map((session) => session.id);
    if (sessionIds.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    const existingSets = await db.exerciseSet.findMany({
      where: {
        sessionId: {
          in: sessionIds,
        },
      },
      select: {
        exerciseId: true,
      },
      distinct: ["exerciseId"],
    });

    const existingExerciseIds = new Set(existingSets.map((set) => set.exerciseId));
    const orderedUniqueIds = Array.from(new Set(payload.orderedExerciseIds));

    const missingIds = Array.from(existingExerciseIds).filter((id) => !orderedUniqueIds.includes(id));
    const finalOrder = [...orderedUniqueIds, ...missingIds].filter((id) => existingExerciseIds.has(id));

    try {
      await db.$transaction(
        finalOrder.map((exerciseId, order) =>
          db.exerciseSet.updateMany({
            where: {
              sessionId: {
                in: sessionIds,
              },
              exerciseId,
            },
            data: {
              exerciseOrder: order,
            },
          }),
        ),
      );
    } catch (error) {
      if (!isExerciseOrderUnsupported(error)) {
        throw error;
      }

      // Compatibility mode: older Prisma clients/schemas can still read workouts,
      // but reordering persistence is unavailable until exerciseOrder is present.
      return NextResponse.json({ updated: 0, compatibilityMode: true });
    }

    return NextResponse.json({ updated: finalOrder.length });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_REORDER_EXERCISES",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
