import { NextResponse } from "next/server";
import { z } from "zod";
import { calculatePlateLoadPerSide } from "@/lib/training/plate-calculator";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

const createSetSchema = z.object({
  liftId: z.enum(["SQ", "DL", "BP"]).optional(),
  exerciseId: z.string().optional(),
  exerciseName: z.string().min(1).max(120).optional(),
  repsTarget: z.number().int().min(1).max(100),
  percentage: z.number().min(0).max(1).optional(),
  isAmrap: z.boolean().optional(),
  targetWeight: z.number().positive(),
  barbellWeight: z.number().positive().optional(),
  unit: z.enum(["kg", "lb"]),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { sessionId } = await context.params;
    const body = await request.json();
    const payload = createSetSchema.parse(body);

    const session = await db.workoutSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!session) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    let exerciseId = payload.exerciseId;

    if (!exerciseId && payload.exerciseName) {
      const exercise = await db.exercise.create({
        data: {
          userId: user.id,
          name: payload.exerciseName.trim(),
          preferredUnit: payload.unit,
        },
      });
      exerciseId = exercise.id;
    }

    if (!exerciseId) {
      return NextResponse.json({ error: "EXERCISE_REQUIRED" }, { status: 400 });
    }

    const [existingSetsCount, existingExerciseSet, lastOrderedSet] = await Promise.all([
      db.exerciseSet.count({ where: { sessionId } }),
      db.exerciseSet.findFirst({
        where: {
          sessionId,
          exerciseId,
        },
        select: {
          exerciseOrder: true,
        },
      }),
      db.exerciseSet.findFirst({
        where: { sessionId },
        orderBy: {
          exerciseOrder: "desc",
        },
        select: {
          exerciseOrder: true,
        },
      }),
    ]);

    const exerciseOrder = existingExerciseSet?.exerciseOrder ?? ((lastOrderedSet?.exerciseOrder ?? -1) + 1);

    let plateCalc: ReturnType<typeof calculatePlateLoadPerSide> | null = null;
    let barbellWeightForSet: number | null = null;

    if (payload.barbellWeight !== undefined && payload.targetWeight >= payload.barbellWeight) {
      barbellWeightForSet = payload.barbellWeight;
      plateCalc = calculatePlateLoadPerSide({
        targetWeight: payload.targetWeight,
        barbellWeight: payload.barbellWeight,
        unit: payload.unit,
      });
    }

    const set = await db.exerciseSet.create({
      data: {
        sessionId,
        exerciseId,
        exerciseOrder,
        liftId: payload.liftId,
        setNumber: existingSetsCount + 1,
        repsTarget: payload.repsTarget,
        percentage: payload.percentage,
        isAmrap: payload.isAmrap ?? false,
        targetWeight: payload.targetWeight,
        barbellWeight: barbellWeightForSet,
        perSideWeight: plateCalc?.roundedPerSide ?? null,
        unit: payload.unit,
      },
      include: {
        exercise: true,
      },
    });

    return NextResponse.json({ set }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_CREATE_SET",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
