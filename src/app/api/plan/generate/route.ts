import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { generate531Session, tmForCycle } from "@/lib/training/531";
import { calculatePlateLoadPerSide } from "@/lib/training/plate-calculator";

function safePerSideWeight(targetWeight: number, unit: "kg" | "lb", barbellWeight = 20): number | null {
  if (targetWeight < barbellWeight) {
    return null;
  }

  const plateCalc = calculatePlateLoadPerSide({
    targetWeight,
    barbellWeight,
    unit,
  });

  return Number(plateCalc.roundedPerSide);
}

const setSchema = z.object({
  weight: z.number().min(0),
  reps: z.number().int().min(1).max(1000).optional(),
  durationSeconds: z.number().int().min(1).max(86400).optional(),
  distanceMeters: z.number().min(0.1).max(100000).optional(),
  bodyweight: z.boolean().optional(),
}).superRefine((set, ctx) => {
  const hasReps = set.reps !== undefined;
  const hasTime = set.durationSeconds !== undefined;
  const hasDist = set.distanceMeters !== undefined;
  const measures = [hasReps, hasTime, hasDist].filter(Boolean).length;
  if (measures === 0) {
    ctx.addIssue({ code: 'custom', message: 'set needs reps, durationSeconds, or distanceMeters', path: [] });
  }
  if (measures > 1) {
    ctx.addIssue({ code: 'custom', message: 'set can have only one of reps / durationSeconds / distanceMeters', path: [] });
  }
});

const exerciseSchema = z.object({
  name: z.string().min(1),
  liftId: z.enum(["SQ", "DL", "BP"]).optional(),
  method: z.enum(["531", "none"]),
  oneRm: z.number().positive().optional(),
  sets: z.array(setSchema).min(1).optional(),
  weight: z.number().positive().optional(),
  reps: z.number().int().positive().optional(),
  unit: z.enum(["kg", "lb"]),
}).superRefine((exercise, context) => {
  if (exercise.method === "531" && !exercise.oneRm) {
    context.addIssue({
      code: "custom",
      message: "oneRm is required for 5/3/1 exercises",
      path: ["oneRm"],
    });
  }

  if (exercise.method === "none" && !exercise.sets?.length && !(exercise.weight && exercise.reps)) {
    context.addIssue({
      code: "custom",
      message: "At least one set is required for non-5/3/1 exercises",
      path: ["sets"],
    });
  }
});

const generatePlanSchema = z.object({
  exercises: z.array(exerciseSchema).min(1),
  startDate: z.string().refine((date) => !isNaN(new Date(date).getTime()), "Invalid date format"),
  weekNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1),
  generateMonthly: z.boolean().default(false),
});

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const body = await request.json();
    const payload = generatePlanSchema.parse(body);

    const startDate = new Date(payload.startDate);
    startDate.setUTCHours(0, 0, 0, 0);

    const exercises = payload.exercises;
    const has531Exercises = exercises.some((exercise) => exercise.method === "531");
    const shouldIncludeDeload = has531Exercises && payload.weekNumber === 3 && !payload.generateMonthly;

    const weeksToGenerate = payload.generateMonthly
      ? Array.from({ length: 5 - payload.weekNumber }, (_, i) => payload.weekNumber + i)
      : shouldIncludeDeload
        ? [3, 4]
        : [payload.weekNumber];

    const sessions: Array<Awaited<ReturnType<typeof db.workoutSession.create>>> = [];
    const createdSets: Array<Awaited<ReturnType<typeof db.exerciseSet.create>>> = [];

    // For each week to generate
    for (const weekNum of weeksToGenerate) {
      // Calculate days offset from start date
      const daysOffset = (weekNum - payload.weekNumber) * 7;
      const sessionDate = new Date(startDate);
      sessionDate.setDate(sessionDate.getDate() + daysOffset);

      // Create a workout session for this week
      const session = await db.workoutSession.create({
        data: {
          userId: user.id,
          title: `Week ${weekNum} - ${sessionDate.toLocaleDateString()}`,
          startedAt: sessionDate,
        },
      });

      sessions.push(session);

      // For each exercise, generate sets
      for (const [exerciseIndex, exercise] of exercises.entries()) {
        let exerciseRecord = await db.exercise.findFirst({
          where: {
            name: exercise.name,
            userId: user.id,
          },
        });

        if (!exerciseRecord) {
          exerciseRecord = await db.exercise.create({
            data: {
              userId: user.id,
              name: exercise.name,
              preferredUnit: exercise.unit,
            },
          });
        }

        if (exercise.method === "531" && exercise.liftId && exercise.oneRm) {
          // Get or create training profile
          let profile = await db.training531Profile.findFirst({
            where: {
              userId: user.id,
              liftId: exercise.liftId,
            },
          });

          if (!profile) {
            profile = await db.training531Profile.create({
              data: {
                userId: user.id,
                liftId: exercise.liftId,
                oneRm: exercise.oneRm,
                cycleNumber: 1,
                unit: exercise.unit as "kg" | "lb",
              },
            });
          }

          // Calculate TM for this cycle
          const tm = tmForCycle(exercise.oneRm, exercise.liftId, exercise.unit as "kg" | "lb", 1);

          // Generate 531 sets for this week
          const plan = generate531Session({
            tm,
            weekNumber: weekNum as 1 | 2 | 3 | 4,
            unit: exercise.unit as "kg" | "lb",
          });

          // Create sets for the main lift
          for (const mainSet of plan) {
            const perSideWeight = safePerSideWeight(
              Number(mainSet.weight),
              exercise.unit as "kg" | "lb",
            );

            const set = await db.exerciseSet.create({
              data: {
                sessionId: session.id,
                exerciseId: exerciseRecord.id,
                exerciseOrder: exerciseIndex,
                liftId: exercise.liftId,
                setNumber: mainSet.setNumber,
                repsTarget: mainSet.reps,
                targetWeight: Number(mainSet.weight),
                percentage: mainSet.percentage,
                isAmrap: mainSet.isAmrap,
                unit: exercise.unit as "kg" | "lb",
                perSideWeight,
              },
            });

            createdSets.push(set);
          }
        } else if (exercise.method === "none") {
          const setsToCreate = exercise.sets?.length
            ? exercise.sets
            : exercise.weight && exercise.reps
              ? [{ weight: exercise.weight, reps: exercise.reps }]
              : [];

          for (const [index, customSet] of setsToCreate.entries()) {
            const weight = customSet.bodyweight ? 0 : customSet.weight;
            const perSideWeight = safePerSideWeight(weight, exercise.unit as "kg" | "lb");
            const repsTarget = customSet.reps ?? 1;

            const set = await db.exerciseSet.create({
              data: {
                sessionId: session.id,
                exerciseId: exerciseRecord.id,
                exerciseOrder: exerciseIndex,
                setNumber: index + 1,
                repsTarget,
                targetWeight: weight,
                unit: exercise.unit as "kg" | "lb",
                perSideWeight,
                durationSeconds: customSet.durationSeconds,
                distanceMeters: customSet.distanceMeters,
              },
            });

            createdSets.push(set);
          }
        }
      }
    }

    return NextResponse.json(
      {
        sessions,
        createdSets,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_GENERATE_PLAN",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
