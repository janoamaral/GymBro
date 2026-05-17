import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

const updateWorkoutSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  finishedAt: z.string().datetime().nullable().optional(),
  feelingScore: z.number().int().min(1).max(10).nullable().optional(),
  feelingNotes: z.string().max(500).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { sessionId } = await context.params;
    const body = await request.json();
    const payload = updateWorkoutSchema.parse(body);

    const session = await db.workoutSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
    });

    if (!session) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    const updated = await db.workoutSession.update({
      where: { id: sessionId },
      data: {
        title: payload.title?.trim(),
        finishedAt:
          payload.finishedAt !== undefined
            ? payload.finishedAt === null
              ? null
              : new Date(payload.finishedAt)
            : undefined,
        feelingScore: payload.feelingScore,
        feelingNotes: payload.feelingNotes?.trim() || payload.feelingNotes,
      },
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_UPDATE_WORKOUT",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { sessionId } = await context.params;

    const session = await db.workoutSession.findFirst({
      where: {
        id: sessionId,
        userId: user.id,
      },
      select: { id: true },
    });

    if (!session) {
      return NextResponse.json({ error: "SESSION_NOT_FOUND" }, { status: 404 });
    }

    await db.workoutSession.delete({
      where: { id: sessionId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_DELETE_WORKOUT",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
