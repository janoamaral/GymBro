import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { generate531Session, tmForCycle } from "@/lib/training/531";
import { calculatePlateLoadPerSide } from "@/lib/training/plate-calculator";

const newCycleSchema = z.object({
  startDate: z.string().refine((date) => !isNaN(new Date(date).getTime()), "Invalid date format"),
});

interface ClonedExercise {
  exerciseId: string;
  name: string;
  liftId: "SQ" | "DL" | "BP" | "OHP" | null;
  method: "531" | "none";
  unit: "kg" | "lb";
  repsTarget: number;
  weight: number;
  oneRm: number | null;
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const body = await request.json();
    const payload = newCycleSchema.parse(body);

    const startDate = new Date(payload.startDate);
    startDate.setUTCHours(0, 0, 0, 0);

    // Get all 531 profiles for this user
    const profiles = await db.training531Profile.findMany({
      where: { userId: user.id },
    });

    if (profiles.length === 0) {
      return NextResponse.json(
        { error: "NO_PROFILES_FOUND", detail: "User has no 5/3/1 profiles" },
        { status: 400 },
      );
    }

    // Update all profiles with new cycle
    const updatedProfiles = await Promise.all(
      profiles.map(async (profile) => {
        // Add cycle increment to 1RM
        const increment = Number(user.cycleIncrement531);
        const currentOneRm = Number(profile.oneRm.toString());

        if (!Number.isFinite(increment) || !Number.isFinite(currentOneRm)) {
          throw new Error(`INVALID_PROFILE_VALUES:${profile.id}`);
        }

        const incrementInProfileUnit =
          profile.unit === "kg"
            ? increment
            : increment / 2.2046; // Convert kg to lb if needed

        const newOneRm = Number((currentOneRm + incrementInProfileUnit).toFixed(2));

        return db.training531Profile.update({
          where: { id: profile.id },
          data: {
            oneRm: newOneRm,
            cycleNumber: Number(profile.cycleNumber) + 1,
          },
        });
      }),
    );

    // Get the last completed week's sessions to extract exercises
    // We'll look for sessions in the past 7-14 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const lastWeekSessions = await db.workoutSession.findMany({
      where: {
        userId: user.id,
        startedAt: {
          gte: fourteenDaysAgo,
          lte: sevenDaysAgo,
        },
      },
      include: {
        sets: {
          include: {
            exercise: true,
          },
        },
      },
    });

    const sessions: Array<Awaited<ReturnType<typeof db.workoutSession.create>>> = [];
    const createdSets: Array<Awaited<ReturnType<typeof db.exerciseSet.create>>> = [];

    // If there are no previous sessions, just create empty sessions for the week
    if (lastWeekSessions.length === 0) {
      // Create 4 empty sessions for the new week (one week, 4 days like the standard 5/3/1 split)
      for (let i = 0; i < 4; i++) {
        const sessionDate = new Date(startDate);
        sessionDate.setDate(sessionDate.getDate() + i * 2); // Every other day

        const session = await db.workoutSession.create({
          data: {
            userId: user.id,
            title: `Cycle ${updatedProfiles[0].cycleNumber} - Day ${i + 1} - ${sessionDate.toLocaleDateString()}`,
            startedAt: sessionDate,
          },
        });

        sessions.push(session);
      }

      return NextResponse.json(
        {
          sessions,
          createdSets,
          profiles: updatedProfiles,
          message: "New cycle started with no exercises to clone",
        },
        { status: 201 },
      );
    }

    // Extract unique exercises from last week
    const exerciseMap = new Map<string, ClonedExercise>();

    lastWeekSessions.forEach((session) => {
      session.sets.forEach((set) => {
        const key = set.exercise.id;
        if (!exerciseMap.has(key)) {
          exerciseMap.set(key, {
            exerciseId: set.exercise.id,
            name: set.exercise.name,
            liftId: set.liftId,
            method: set.liftId ? "531" : "none",
            unit: set.unit,
            repsTarget: set.repsTarget,
            weight: Number(set.targetWeight),
            oneRm: (() => {
              const profileOneRm = updatedProfiles.find((p) => p.liftId === set.liftId)?.oneRm;
              return profileOneRm == null ? null : Number(profileOneRm.toString());
            })(),
          });
        }
      });
    });

    // Generate sessions for the new cycle (week 1)
    const exercisesArray = Array.from(exerciseMap.values());

    // Create 4 sessions for week 1
    for (let i = 0; i < 4; i++) {
      const sessionDate = new Date(startDate);
      sessionDate.setDate(sessionDate.getDate() + i * 2);

      const session = await db.workoutSession.create({
        data: {
          userId: user.id,
          title: `Cycle ${updatedProfiles[0].cycleNumber} Week 1 - Day ${i + 1} - ${sessionDate.toLocaleDateString()}`,
          startedAt: sessionDate,
        },
      });

      sessions.push(session);

      // For each exercise, create sets
      for (const ex of exercisesArray) {
        if (ex.method === "531" && ex.liftId && ex.oneRm) {
          // Generate 531 sets for week 1 with new 1RM
          const tm = tmForCycle(ex.oneRm, ex.liftId, ex.unit, updatedProfiles[0].cycleNumber);
          const plan = generate531Session({
            tm,
            weekNumber: 1 as const,
            unit: ex.unit,
          });

          // Create main sets
          for (const mainSet of plan) {
            const plateCalc = calculatePlateLoadPerSide(
              {
                targetWeight: Number(mainSet.weight),
                barbellWeight: 20,
                unit: ex.unit,
              }
            );

            const set = await db.exerciseSet.create({
              data: {
                sessionId: session.id,
                exerciseId: ex.exerciseId,
                liftId: ex.liftId,
                setNumber: mainSet.setNumber,
                repsTarget: mainSet.reps,
                targetWeight: Number(mainSet.weight),
                percentage: mainSet.percentage,
                isAmrap: mainSet.isAmrap,
                unit: ex.unit,
                perSideWeight: Number(plateCalc.roundedPerSide),
              },
            });

            createdSets.push(set);
          }
        } else if (ex.method === "none") {
          // Clone the same weight and reps
          const plateCalc = calculatePlateLoadPerSide(
            {
              targetWeight: ex.weight,
              barbellWeight: 20,
              unit: ex.unit,
            }
          );

          const set = await db.exerciseSet.create({
            data: {
              sessionId: session.id,
              exerciseId: ex.exerciseId,
              setNumber: 1,
              repsTarget: ex.repsTarget,
              targetWeight: ex.weight,
              unit: ex.unit,
              perSideWeight: Number(plateCalc.roundedPerSide),
            },
          });

          createdSets.push(set);
        }
      }
    }

    return NextResponse.json(
      {
        sessions,
        createdSets,
        profiles: updatedProfiles,
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
        error: "FAILED_TO_CREATE_NEW_CYCLE",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
