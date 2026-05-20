import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { calculateE1rm, tmForCycle } from "@/lib/training/531";

const querySchema = z.object({
  liftId: z.enum(["SQ", "DL", "BP"]),
});

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const url = new URL(request.url);

    const parsed = querySchema.parse({
      liftId: url.searchParams.get("liftId"),
    });

    const profile = await db.training531Profile.findUnique({
      where: {
        userId_liftId: {
          userId: user.id,
          liftId: parsed.liftId,
        },
      },
    });

    const currentTm = profile
      ? tmForCycle(Number(profile.oneRm), parsed.liftId, profile.unit, profile.cycleNumber)
      : null;

    const sets = await db.exerciseSet.findMany({
      where: {
        session: { userId: user.id },
        liftId: parsed.liftId,
        OR: [
          {
            e1rm: {
              not: null,
            },
          },
          {
            isDone: true,
          },
          {
            repsDone: {
              not: null,
            },
          },
        ],
      },
      include: {
        session: {
          select: {
            startedAt: true,
          },
        },
      },
      orderBy: [{ session: { startedAt: "asc" } }, { createdAt: "asc" }],
      take: 200,
    });

    const points = sets
      .map((set) => {
        const repsForEstimate = set.repsDone ?? (set.isDone ? set.repsTarget : null);
        const fallbackE1rm =
          repsForEstimate && repsForEstimate > 0
            ? calculateE1rm(Number(set.targetWeight), repsForEstimate)
            : null;

        const effectiveE1rm = set.e1rm === null ? fallbackE1rm : Number(set.e1rm);

        if (effectiveE1rm === null) {
          return null;
        }

        return {
          id: set.id,
          date: (set.session.startedAt ?? set.amrapLoggedAt ?? set.createdAt).toISOString(),
          e1rm: effectiveE1rm,
          repsDone: set.repsDone,
          repsTarget: set.repsTarget,
          targetWeight: Number(set.targetWeight),
          amrapStatus: set.amrapStatus,
          unit: set.unit,
        };
      })
      .filter((point): point is NonNullable<typeof point> => point !== null);

    return NextResponse.json({
      liftId: parsed.liftId,
      unit: profile?.unit ?? null,
      currentTm,
      points,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_QUERY", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_531_PROGRESS",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
