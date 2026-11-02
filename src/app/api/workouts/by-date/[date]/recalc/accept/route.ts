import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import {
  getSessionRecalculation,
  snapshotOriginal,
} from "@/lib/training/session-recalculation";

const decisionSchema = z.object({ accepted: z.boolean() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { date } = await params;
    const { accepted } = decisionSchema.parse(await request.json());
    const recalculation = await getSessionRecalculation(user.id, date);

    if (!recalculation) {
      return NextResponse.json({ error: "NO_ACTIVE_RECALCULATION" }, { status: 404 });
    }

    await db.$transaction(async (tx) => {
      await snapshotOriginal(tx, user.id, recalculation);

      if (accepted) {
        const suggestedIds = new Set(
          recalculation.suggestedSets.flatMap((set) => (set.id ? [set.id] : [])),
        );
        const removedIds = recalculation.originalSets.flatMap((set) =>
          set.id && !suggestedIds.has(set.id) ? [set.id] : [],
        );

        if (removedIds.length > 0) {
          await tx.exerciseSet.deleteMany({
            where: { sessionId: recalculation.sessionId, id: { in: removedIds } },
          });
        }

        for (const set of recalculation.suggestedSets) {
          if (!set.id) continue;
          await tx.exerciseSet.updateMany({
            where: { id: set.id, sessionId: recalculation.sessionId },
            data: {
              targetWeight: set.targetWeight,
              repsTarget: set.repsTarget,
              percentage: set.percentage,
              perSideWeight: null,
            },
          });
        }
      }

      await tx.workoutSession.update({
        where: { id: recalculation.sessionId },
        data: { recalculationVersion: accepted ? 1 : 0 },
      });
      await tx.userActivityLog.create({
        data: {
          userId: user.id,
          action: accepted ? "recalc_accept" : "recalc_reject",
          metadata: {
            sessionId: recalculation.sessionId,
            liftId: recalculation.liftId,
            level: recalculation.level,
          },
        },
      });
    });

    return NextResponse.json({
      accepted,
      recalculationVersion: accepted ? 1 : 0,
      sessionId: recalculation.sessionId,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "INVALID_DATE_FORMAT") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: "FAILED_TO_SAVE_RECALCULATION_DECISION",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
