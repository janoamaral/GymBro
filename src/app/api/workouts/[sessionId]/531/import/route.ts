import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { plan531Week } from "@/lib/training/531";

const importSchema = z.object({
  liftId: z.enum(["SQ", "DL", "BP", "OHP"]),
  oneRm: z.number().positive(),
  unit: z.enum(["kg", "lb"]),
  weekNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  cycleNumber: z.number().int().min(1).default(1),
  roundingMode: z.enum(["nearest", "up", "down"]).default("nearest"),
  assistanceVariant: z.enum(["NONE", "BBB", "FSL"]).default("NONE"),
  bbbPercentage: z.number().min(0.3).max(0.7).default(0.5),
});

const LIFT_EXERCISE_NAME: Record<"SQ" | "DL" | "BP" | "OHP", string> = {
  SQ: "Back Squat",
  DL: "Deadlift",
  BP: "Bench Press",
  OHP: "Overhead Press",
};

export async function POST(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { sessionId } = await context.params;
    const body = await request.json();
    const payload = importSchema.parse(body);

    const session = await db.workoutSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!session) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const plan = plan531Week(payload);

    const exerciseName = LIFT_EXERCISE_NAME[payload.liftId];

    const existingExercise = await db.exercise.findFirst({
      where: {
        userId: user.id,
        name: exerciseName,
      },
    });

    const exercise =
      existingExercise ??
      (await db.exercise.create({
        data: {
          userId: user.id,
          name: exerciseName,
          preferredUnit: payload.unit,
        },
      }));

    const existingSetsCount = await db.exerciseSet.count({
      where: { sessionId },
    });

    const createdSets = await Promise.all(
      plan.sets.map((set, index) =>
        db.exerciseSet.create({
          data: {
            sessionId,
            exerciseId: exercise.id,
            liftId: payload.liftId,
            setNumber: existingSetsCount + index + 1,
            repsTarget: set.reps,
            percentage: set.percentage,
            isAmrap: set.isAmrap,
            targetWeight: set.weight,
            unit: payload.unit,
          },
          include: {
            exercise: true,
          },
        }),
      ),
    );

    const assistanceExerciseName =
      plan.assistanceVariant === "BBB"
        ? `${exerciseName} BBB`
        : plan.assistanceVariant === "FSL"
          ? `${exerciseName} FSL`
          : null;

    let assistanceExerciseId: string | undefined;

    if (assistanceExerciseName) {
      const existingAssistance = await db.exercise.findFirst({
        where: {
          userId: user.id,
          name: assistanceExerciseName,
        },
      });

      const assistanceExercise =
        existingAssistance ??
        (await db.exercise.create({
          data: {
            userId: user.id,
            name: assistanceExerciseName,
            preferredUnit: payload.unit,
          },
        }));

      assistanceExerciseId = assistanceExercise.id;
    }

    let createdAssistanceSets: Awaited<ReturnType<typeof db.exerciseSet.create>>[] = [];

    if (assistanceExerciseId && plan.assistanceSets.length > 0) {
      const assistanceId = assistanceExerciseId;

      createdAssistanceSets = await Promise.all(
        plan.assistanceSets.map((set, index) =>
          db.exerciseSet.create({
            data: {
              sessionId,
              exerciseId: assistanceId,
              liftId: payload.liftId,
              setNumber: existingSetsCount + plan.sets.length + index + 1,
              repsTarget: set.reps,
              percentage: set.percentage,
              isAmrap: false,
              targetWeight: set.weight,
              unit: payload.unit,
            },
            include: {
              exercise: true,
            },
          }),
        ),
      );
    }

    return NextResponse.json({
      plan,
      imported: createdSets.length + createdAssistanceSets.length,
      createdSets,
      createdAssistanceSets,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_IMPORT_531_PLAN",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
