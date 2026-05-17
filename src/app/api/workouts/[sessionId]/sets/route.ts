import { NextResponse } from "next/server";
import { z } from "zod";
import { calculatePlateLoadPerSide } from "@/lib/training/plate-calculator";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";

const createSetSchema = z.object({
  exerciseId: z.string().optional(),
  exerciseName: z.string().min(1).max(120).optional(),
  repsTarget: z.number().int().min(1).max(100),
  targetWeight: z.number().positive(),
  barbellWeight: z.number().positive(),
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

    const existingSetsCount = await db.exerciseSet.count({ where: { sessionId } });

    const plateCalc = calculatePlateLoadPerSide({
      targetWeight: payload.targetWeight,
      barbellWeight: payload.barbellWeight,
      unit: payload.unit,
    });

    const set = await db.exerciseSet.create({
      data: {
        sessionId,
        exerciseId,
        setNumber: existingSetsCount + 1,
        repsTarget: payload.repsTarget,
        targetWeight: payload.targetWeight,
        barbellWeight: payload.barbellWeight,
        perSideWeight: plateCalc.roundedPerSide,
        unit: payload.unit,
      },
      include: {
        exercise: true,
      },
    });

    return NextResponse.json({ set }, { status: 201 });
  } catch (error) {
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
