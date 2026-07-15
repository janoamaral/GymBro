import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

type IsoDateParts = { year: number; month: number; day: number };

function parseIsoDateParts(value: string): IsoDateParts | null {
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

function isExerciseOrderUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Unknown argument `exerciseOrder`/i.test(error.message);
}

const createExerciseSchema = z
  .object({
    exerciseId: z.string().min(1).optional(),
    exerciseName: z.string().min(1).max(120).optional(),
    repsTarget: z.number().int().min(1).max(1000).optional(),
    targetWeight: z.number().min(0),
    unit: z.enum(["kg", "lb"]),
    liftId: z.enum(["SQ", "DL", "BP"]).optional(),
    durationSeconds: z.number().int().min(1).max(86400).optional(),
    distanceMeters: z.number().min(0.1).max(100000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.exerciseId && !value.exerciseName) {
      ctx.addIssue({
        code: "custom",
        message: "exerciseId or exerciseName is required",
        path: [],
      });
    }

    const measures = [value.repsTarget, value.durationSeconds, value.distanceMeters].filter(
      (m) => m !== undefined,
    ).length;

    if (measures > 1) {
      ctx.addIssue({
        code: "custom",
        message: "only one of repsTarget / durationSeconds / distanceMeters is allowed",
        path: [],
      });
    }
  });

export async function POST(
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

    const body = await request.json();
    const payload = createExerciseSchema.parse(body);

    const dayStart = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 23, 59, 59, 999));

    // Reuse the first session of the day (createdAt asc, mismo criterio que el GET).
    let session = await db.workoutSession.findFirst({
      where: {
        userId: user.id,
        startedAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!session) {
      session = await db.workoutSession.create({
        data: {
          userId: user.id,
          title: `Workout ${date}`,
          startedAt: dayStart,
        },
      });
    }

    // Resolve exerciseId: find-or-create por name+userId (patrón de plan/generate).
    let exerciseId = payload.exerciseId;

    if (!exerciseId && payload.exerciseName) {
      const existing = await db.exercise.findFirst({
        where: { name: payload.exerciseName.trim(), userId: user.id },
      });

      if (existing) {
        exerciseId = existing.id;
      } else {
        const created = await db.exercise.create({
          data: {
            userId: user.id,
            name: payload.exerciseName.trim(),
            preferredUnit: payload.unit,
          },
        });
        exerciseId = created.id;
      }
    }

    if (!exerciseId) {
      return NextResponse.json({ error: "EXERCISE_REQUIRED" }, { status: 400 });
    }

    // exerciseOrder: MAX+1 sobre todas las series del día.
    let exerciseOrder = 0;
    try {
      const lastOrderedSet = await db.exerciseSet.findFirst({
        where: {
          session: { userId: user.id, startedAt: { gte: dayStart, lte: dayEnd } },
        },
        orderBy: { exerciseOrder: "desc" },
        select: { exerciseOrder: true },
      });

      exerciseOrder = (lastOrderedSet?.exerciseOrder ?? -1) + 1;
    } catch (error) {
      if (!isExerciseOrderUnsupported(error)) {
        throw error;
      }
      exerciseOrder = 0;
    }

    const existingSetsCount = await db.exerciseSet.count({ where: { sessionId: session.id } });
    const repsTarget = payload.repsTarget ?? 1;
    const targetWeight = payload.targetWeight;

    let createdSet;
    try {
      createdSet = await db.exerciseSet.create({
        data: {
          sessionId: session.id,
          exerciseId,
          exerciseOrder,
          liftId: payload.liftId,
          setNumber: existingSetsCount + 1,
          repsTarget,
          targetWeight,
          unit: payload.unit,
          durationSeconds: payload.durationSeconds,
          distanceMeters: payload.distanceMeters,
        },
        include: { exercise: true },
      });
    } catch (error) {
      if (!isExerciseOrderUnsupported(error)) {
        throw error;
      }

      createdSet = await db.exerciseSet.create({
        data: {
          sessionId: session.id,
          exerciseId,
          liftId: payload.liftId,
          setNumber: existingSetsCount + 1,
          repsTarget,
          targetWeight,
          unit: payload.unit,
          durationSeconds: payload.durationSeconds,
          distanceMeters: payload.distanceMeters,
        },
        include: { exercise: true },
      });
    }

    return NextResponse.json({ set: createdSet, exercise: createdSet.exercise }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_CREATE_EXERCISE",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ date: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { date } = await context.params;
    const { searchParams } = new URL(request.url);
    const exerciseId = searchParams.get("exerciseId");

    if (!exerciseId) {
      return NextResponse.json({ error: "MISSING_EXERCISE_ID" }, { status: 400 });
    }

    const dateParts = parseIsoDateParts(date);
    if (!dateParts) {
      return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
    }

    const dayStart = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 23, 59, 59, 999));

    const sessions = await db.workoutSession.findMany({
      where: {
        userId: user.id,
        startedAt: { gte: dayStart, lte: dayEnd },
      },
      select: { id: true },
    });

    if (sessions.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    const sessionIds = sessions.map((session) => session.id);

    const result = await db.exerciseSet.deleteMany({
      where: {
        sessionId: { in: sessionIds },
        exerciseId,
      },
    });

    // No eliminamos sesiones vacías para preservar metadata de reschedule.
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_DELETE_EXERCISE",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}