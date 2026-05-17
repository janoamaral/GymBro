import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { generate531Session, tmForCycle } from "@/lib/training/531";
import { calculatePlateLoadPerSide } from "@/lib/training/plate-calculator";

const setSchema = z.object({
  weight: z.number().positive(),
  reps: z.number().int().positive(),
});

const exerciseSchema = z.object({
  name: z.string().min(1),
  liftId: z.enum(["SQ", "DL", "BP", "OHP"]).optional(),
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
      for (const exercise of exercises) {
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
            const plateCalc = calculatePlateLoadPerSide(
              {
                targetWeight: Number(mainSet.weight),
                barbellWeight: 20,
                unit: exercise.unit as "kg" | "lb",
              }
            );

            const set = await db.exerciseSet.create({
              data: {
                sessionId: session.id,
                exerciseId: exerciseRecord.id,
                liftId: exercise.liftId,
                setNumber: mainSet.setNumber,
                repsTarget: mainSet.reps,
                targetWeight: Number(mainSet.weight),
                percentage: mainSet.percentage,
                isAmrap: mainSet.isAmrap,
                unit: exercise.unit as "kg" | "lb",
                perSideWeight: Number(plateCalc.roundedPerSide),
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
            const plateCalc = calculatePlateLoadPerSide(
              {
                targetWeight: customSet.weight,
                barbellWeight: 20,
                unit: exercise.unit as "kg" | "lb",
              }
            );

            const set = await db.exerciseSet.create({
              data: {
                sessionId: session.id,
                exerciseId: exerciseRecord.id,
                setNumber: index + 1,
                repsTarget: customSet.reps,
                targetWeight: customSet.weight,
                unit: exercise.unit as "kg" | "lb",
                perSideWeight: Number(plateCalc.roundedPerSide),
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
