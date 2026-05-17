import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { logAmrap } from "@/lib/training/531";

const updateSetSchema = z.object({
  repsDone: z.number().int().min(1).max(100).nullable().optional(),
  repsTarget: z.number().int().min(1).max(100).optional(),
  logAsAmrap: z.boolean().optional(),
  isDone: z.boolean().optional(),
  setFeelingScore: z.number().int().min(1).max(5).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string; setId: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { sessionId, setId } = await context.params;
    const body = await request.json();
    const payload = updateSetSchema.parse(body);

    const set = await db.exerciseSet.findFirst({
      where: {
        id: setId,
        sessionId,
        session: {
          userId: user.id,
        },
      },
    });

    if (!set) {
      return NextResponse.json({ error: "SET_NOT_FOUND" }, { status: 404 });
    }

    const shouldLogAmrap =
      payload.repsDone !== undefined && payload.repsDone !== null && (set.isAmrap || payload.logAsAmrap);

    const amrapResult =
      shouldLogAmrap && payload.repsDone !== undefined && payload.repsDone !== null
        ? logAmrap({
            plannedReps: payload.repsTarget ?? set.repsTarget,
            weight: Number(set.targetWeight),
            repsPerformed: payload.repsDone,
          })
        : null;

    const updated = await db.exerciseSet.update({
      where: { id: setId },
      data: {
        repsDone: payload.repsDone,
        repsTarget: payload.repsTarget,
        e1rm: amrapResult?.e1rm,
        amrapStatus: amrapResult?.status,
        amrapLoggedAt: amrapResult ? new Date() : undefined,
        isDone: payload.isDone,
        setFeelingScore: payload.setFeelingScore,
      },
      include: {
        exercise: true,
      },
    });

    return NextResponse.json({ set: updated, amrap: amrapResult });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_UPDATE_SET",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
