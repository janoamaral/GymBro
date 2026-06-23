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

const newCycleSchema = z.object({
  startDate: z.string().refine((date) => !Number.isNaN(new Date(date).getTime()), "Invalid date format"),
});

type TemplateSet = {
  exerciseId: string;
  exerciseName: string;
  exerciseOrder: number;
  liftId: "SQ" | "DL" | "BP" | null;
  setNumber: number;
  repsTarget: number;
  targetWeight: number;
  unit: "kg" | "lb";
};

type TemplateSession = {
  title: string;
  weekday: number;
  sets: TemplateSet[];
};

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function endOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function nextWeekdayOnOrAfter(date: Date, weekday: number): Date {
  const dayDiff = (weekday - date.getUTCDay() + 7) % 7;
  return addUtcDays(date, dayDiff);
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

    // Build a week template from the latest week that has sessions with sets.
    const latestSessionWithSets = await db.workoutSession.findFirst({
      where: {
        userId: user.id,
        sets: {
          some: {},
        },
      },
      orderBy: {
        startedAt: "desc",
      },
      select: {
        startedAt: true,
      },
    });

    if (!latestSessionWithSets) {
      return NextResponse.json(
        {
          error: "NO_TEMPLATE_WORKOUTS",
          detail: "No workouts with exercises found to clone for the new cycle",
        },
        { status: 400 },
      );
    }

    const templateWeekEnd = endOfUtcDay(startOfUtcDay(latestSessionWithSets.startedAt));
    const templateWeekStart = addUtcDays(startOfUtcDay(latestSessionWithSets.startedAt), -6);

    const templateSourceSessions = await db.workoutSession.findMany({
      where: {
        userId: user.id,
        startedAt: {
          gte: templateWeekStart,
          lte: templateWeekEnd,
        },
        sets: {
          some: {},
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
      orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
    });

    const sessions: Array<Awaited<ReturnType<typeof db.workoutSession.create>>> = [];
    const createdSets: Array<Awaited<ReturnType<typeof db.exerciseSet.create>>> = [];

    if (templateSourceSessions.length === 0) {
      return NextResponse.json(
        {
          error: "NO_TEMPLATE_WORKOUTS",
          detail: "No workouts with exercises found to clone for the new cycle",
        },
        { status: 400 },
      );
    }

    // Update all profiles with new cycle only after we know we can build sessions.
    const updatedProfiles = await Promise.all(
      profiles.map(async (profile) => {
        const increment = Number(user.cycleIncrement531);
        const currentOneRm = Number(profile.oneRm.toString());

        if (!Number.isFinite(increment) || !Number.isFinite(currentOneRm)) {
          throw new TypeError(`INVALID_PROFILE_VALUES:${profile.id}`);
        }

        const incrementInProfileUnit =
          profile.unit === "kg"
            ? increment
            : increment / 2.2046;

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

    const templateSessions: TemplateSession[] = templateSourceSessions.map((session) => ({
      title: session.title,
      weekday: session.startedAt.getUTCDay(),
      sets: session.sets.map((set) => ({
        exerciseId: set.exerciseId,
        exerciseName: set.exercise.name,
        exerciseOrder: set.exerciseOrder,
        liftId: set.liftId,
        setNumber: set.setNumber,
        repsTarget: set.repsTarget,
        targetWeight: Number(set.targetWeight),
        unit: set.unit,
      })),
    }));

    const profileByLift = new Map(
      updatedProfiles.map((profile) => [profile.liftId, profile] as const),
    );

    // Build a full 4-week cycle preserving each template session weekday.
    for (let weekNumber = 1; weekNumber <= 4; weekNumber++) {
      const cycleWeek = weekNumber as 1 | 2 | 3 | 4;
      for (const templateSession of templateSessions) {
        const firstSessionDate = nextWeekdayOnOrAfter(startDate, templateSession.weekday);
        const sessionDate = addUtcDays(firstSessionDate, (weekNumber - 1) * 7);

        const session = await db.workoutSession.create({
          data: {
            userId: user.id,
            title: `Cycle ${updatedProfiles[0].cycleNumber} Week ${weekNumber} - ${templateSession.title}`,
            startedAt: sessionDate,
          },
        });

        sessions.push(session);

        const setsByExercise = new Map<string, TemplateSet[]>();
        templateSession.sets.forEach((set) => {
          const key = set.exerciseId;
          const group = setsByExercise.get(key) ?? [];
          group.push(set);
          setsByExercise.set(key, group);
        });

        for (const groupedSets of setsByExercise.values()) {
          const firstSet = groupedSets[0];
          if (!firstSet) {
            continue;
          }

          const hasLiftId = groupedSets.some((set) => set.liftId !== null);
          const looksLikeAssistance = /\s(BBB|FSL)$/i.test(firstSet.exerciseName);

          if (hasLiftId && !looksLikeAssistance && firstSet.liftId) {
            const profile = profileByLift.get(firstSet.liftId);
            if (!profile) {
              continue;
            }

            const profileOneRm = Number(profile.oneRm.toString());
            const tm = tmForCycle(
              profileOneRm,
              firstSet.liftId,
              firstSet.unit,
              profile.cycleNumber,
            );

            const plan = generate531Session({
              tm,
              weekNumber: cycleWeek,
              unit: firstSet.unit,
            });

            for (const mainSet of plan) {
              const perSideWeight = safePerSideWeight(Number(mainSet.weight), firstSet.unit);

              const created = await db.exerciseSet.create({
                data: {
                  sessionId: session.id,
                  exerciseId: firstSet.exerciseId,
                  exerciseOrder: firstSet.exerciseOrder,
                  liftId: firstSet.liftId,
                  setNumber: mainSet.setNumber,
                  repsTarget: mainSet.reps,
                  targetWeight: Number(mainSet.weight),
                  percentage: mainSet.percentage,
                  isAmrap: mainSet.isAmrap,
                  unit: firstSet.unit,
                  perSideWeight,
                },
              });

              createdSets.push(created);
            }

            continue;
          }

          for (const templateSet of groupedSets) {
            const perSideWeight = safePerSideWeight(templateSet.targetWeight, templateSet.unit);

            const created = await db.exerciseSet.create({
              data: {
                sessionId: session.id,
                exerciseId: templateSet.exerciseId,
                exerciseOrder: templateSet.exerciseOrder,
                liftId: templateSet.liftId,
                setNumber: templateSet.setNumber,
                repsTarget: templateSet.repsTarget,
                targetWeight: templateSet.targetWeight,
                unit: templateSet.unit,
                perSideWeight,
              },
            });

            createdSets.push(created);
          }
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
