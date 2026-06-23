import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { generate531Session, tmForCycle, type LiftId } from "@/lib/training/531";
import { calculatePlateLoadPerSide } from "@/lib/training/plate-calculator";

// ponytail: duplicated from generate/route.ts and new-cycle/route.ts — 3 copies cheaper than a shared util file
function safePerSideWeight(targetWeight: number, unit: "kg" | "lb", barbellWeight = 20): number | null {
  if (targetWeight < barbellWeight) {
    return null;
  }
  const plateCalc = calculatePlateLoadPerSide({ targetWeight, barbellWeight, unit });
  return Number(plateCalc.roundedPerSide);
}

// ponytail: duplicated from new-cycle/route.ts — 4 lines, not worth a shared util
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
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

const LIFT_NAMES: Record<LiftId, string> = {
  SQ: "Squat",
  DL: "Dead Lift",
  BP: "Bench Press",
};

const setSchema = z.object({
  weight: z.number().positive(),
  reps: z.number().int().positive(),
});

const accessorySchema = z.object({
  name: z.string().min(1),
  liftId: z.enum(["SQ", "DL", "BP"]).optional(),
  sets: z.array(setSchema).min(1),
  unit: z.enum(["kg", "lb"]),
});

const daySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  mainLift: z.enum(["SQ", "DL", "BP"]).optional(),
  mainOneRm: z.number().positive().optional(),
  mainUnit: z.enum(["kg", "lb"]).optional(),
  accessories: z.array(accessorySchema).default([]),
});

const monthlyPlanSchema = z.object({
  startDate: z.string().refine((date) => !Number.isNaN(new Date(date).getTime()), "Invalid date format"),
  startWeek: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  days: z.array(daySchema).min(1),
});

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const body = await request.json();
    const payload = monthlyPlanSchema.parse(body);

    const startDate = startOfUtcDay(new Date(payload.startDate));
    const startWeek = payload.startWeek;

    // ponytail: build cycle week sequence with wrap-around (3→4→1→2 for startWeek=3)
    const cycleWeeks = [0, 1, 2, 3].map((i) => {
      const w = startWeek + i;
      return (w <= 4 ? w : w - 4) as 1 | 2 | 3 | 4;
    });
    const wrapOccurred = startWeek !== 1;

    const sessions: Array<Awaited<ReturnType<typeof db.workoutSession.create>>> = [];
    const createdSets: Array<Awaited<ReturnType<typeof db.exerciseSet.create>>> = [];

    // Cache main-lift profiles per lift to avoid repeated queries within this request.
    const profileCache = new Map<
      LiftId,
      { oneRm: number; cycleNumber: number; unit: "kg" | "lb" }
    >();

    for (const day of payload.days) {
      // Resolve main lift profile
      let mainProfile: { oneRm: number; cycleNumber: number; unit: "kg" | "lb" } | null = null;

      if (day.mainLift) {
        const liftId = day.mainLift as LiftId;
        let profile = profileCache.get(liftId);

        if (!profile) {
          const existing = await db.training531Profile.findFirst({
            where: { userId: user.id, liftId },
          });

          if (existing) {
            profile = {
              oneRm: Number(existing.oneRm),
              cycleNumber: existing.cycleNumber,
              unit: existing.unit as "kg" | "lb",
            };
          } else if (day.mainOneRm) {
            const unit = (day.mainUnit ?? user.defaultUnit) as "kg" | "lb";
            const created = await db.training531Profile.create({
              data: {
                userId: user.id,
                liftId,
                oneRm: day.mainOneRm,
                cycleNumber: 1,
                unit,
              },
            });
            profile = {
              oneRm: Number(created.oneRm),
              cycleNumber: created.cycleNumber,
              unit: created.unit as "kg" | "lb",
            };
          } else {
            return NextResponse.json(
              { error: "MISSING_1RM", detail: `No profile found for ${liftId} and no mainOneRm provided` },
              { status: 400 },
            );
          }

          profileCache.set(liftId, profile);
        }

        mainProfile = profile;
      }

      for (let weekIndex = 0; weekIndex < 4; weekIndex++) {
        const cycleWeek = cycleWeeks[weekIndex];
        const isWrapped = cycleWeek < startWeek;

        const sessionDate = addUtcDays(
          nextWeekdayOnOrAfter(startDate, day.weekday),
          weekIndex * 7,
        );

        const session = await db.workoutSession.create({
          data: {
            userId: user.id,
            title: `Week ${cycleWeek} - ${sessionDate.toLocaleDateString()}`,
            startedAt: sessionDate,
          },
        });
        sessions.push(session);

        let exerciseOrder = 0;

        // Main lift sets
        if (day.mainLift && mainProfile) {
          const liftId = day.mainLift as LiftId;
          const effectiveCycleNumber = mainProfile.cycleNumber + (isWrapped ? 1 : 0);
          const increment = Number(user.cycleIncrement531);
          const incrementInUnit =
            mainProfile.unit === "kg" ? increment : increment / 2.2046;
          const effectiveOneRm = isWrapped
            ? Number((mainProfile.oneRm + incrementInUnit).toFixed(2))
            : mainProfile.oneRm;

          const tm = tmForCycle(effectiveOneRm, liftId, mainProfile.unit, effectiveCycleNumber);
          const plan = generate531Session({ tm, weekNumber: cycleWeek, unit: mainProfile.unit });

          const exerciseName = LIFT_NAMES[liftId];
          let exerciseRecord = await db.exercise.findFirst({
            where: { name: exerciseName, userId: user.id },
          });
          if (!exerciseRecord) {
            exerciseRecord = await db.exercise.create({
              data: { userId: user.id, name: exerciseName, preferredUnit: mainProfile.unit },
            });
          }

          for (const mainSet of plan) {
            const perSideWeight = safePerSideWeight(Number(mainSet.weight), mainProfile.unit);
            const set = await db.exerciseSet.create({
              data: {
                sessionId: session.id,
                exerciseId: exerciseRecord.id,
                exerciseOrder,
                liftId,
                setNumber: mainSet.setNumber,
                repsTarget: mainSet.reps,
                targetWeight: Number(mainSet.weight),
                percentage: mainSet.percentage,
                isAmrap: mainSet.isAmrap,
                unit: mainProfile.unit,
                perSideWeight,
              },
            });
            createdSets.push(set);
          }
          exerciseOrder++;
        }

        // Accessory sets — fixed absolute weights, no progression across weeks
        for (const accessory of day.accessories) {
          let exerciseRecord = await db.exercise.findFirst({
            where: { name: accessory.name, userId: user.id },
          });
          if (!exerciseRecord) {
            exerciseRecord = await db.exercise.create({
              data: { userId: user.id, name: accessory.name, preferredUnit: accessory.unit },
            });
          }

          for (const [index, customSet] of accessory.sets.entries()) {
            const perSideWeight = safePerSideWeight(customSet.weight, accessory.unit);
            const set = await db.exerciseSet.create({
              data: {
                sessionId: session.id,
                exerciseId: exerciseRecord.id,
                exerciseOrder,
                setNumber: index + 1,
                repsTarget: customSet.reps,
                targetWeight: customSet.weight,
                unit: accessory.unit,
                perSideWeight,
              },
            });
            createdSets.push(set);
          }
          exerciseOrder++;
        }
      }
    }

    // Bump all profiles if wrap occurred (matches new-cycle behavior)
    let updatedProfiles = null;
    if (wrapOccurred) {
      const allProfiles = await db.training531Profile.findMany({ where: { userId: user.id } });
      const increment = Number(user.cycleIncrement531);

      updatedProfiles = await Promise.all(
        allProfiles.map(async (profile) => {
          const currentOneRm = Number(profile.oneRm.toString());
          const incrementInProfileUnit =
            profile.unit === "kg" ? increment : increment / 2.2046;
          const newOneRm = Number((currentOneRm + incrementInProfileUnit).toFixed(2));

          return db.training531Profile.update({
            where: { id: profile.id },
            data: {
              oneRm: newOneRm,
              cycleNumber: profile.cycleNumber + 1,
            },
          });
        }),
      );
    }

    return NextResponse.json(
      { sessions, createdSets, profiles: updatedProfiles },
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
        error: "FAILED_TO_GENERATE_MONTHLY_PLAN",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
