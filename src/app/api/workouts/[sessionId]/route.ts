import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

function parseIsoDateParts(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return { year, month, day };
}

function toIsoLocalDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toFinishedAt(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return new Date(value);
}

const updateWorkoutSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  finishedAt: z.string().datetime().nullable().optional(),
  feelingScore: z.number().int().min(1).max(10).nullable().optional(),
  feelingNotes: z.string().max(500).nullable().optional(),
  rescheduledToLocalDate: z.string().optional(),
  rescheduleReason: z.string().max(300).nullable().optional(),
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

    const hasRescheduleRequest = payload.rescheduledToLocalDate !== undefined;
    let rescheduledStartedAt: Date | undefined = undefined;
    let rescheduledFromLocalDate: string | null = null;
    let rescheduledToLocalDate: string | null = null;

    if (hasRescheduleRequest) {
      const requestedDate = payload.rescheduledToLocalDate;
      const parsedDate = parseIsoDateParts(payload.rescheduledToLocalDate);
      if (!parsedDate) {
        return NextResponse.json({ error: "INVALID_DATE_FORMAT" }, { status: 400 });
      }

      rescheduledStartedAt = new Date(
        Date.UTC(parsedDate.year, parsedDate.month - 1, parsedDate.day, 0, 0, 0, 0),
      );

      rescheduledFromLocalDate = toIsoLocalDate(session.startedAt);
      rescheduledToLocalDate = requestedDate;
    }

    const trimmedTitle = payload.title?.trim();
    const trimmedFeelingNotes = payload.feelingNotes?.trim() || payload.feelingNotes;
    const finishedAt = toFinishedAt(payload.finishedAt);

    const updated = await db.workoutSession.update({
      where: { id: sessionId },
      data: {
        title: trimmedTitle,
        startedAt: rescheduledStartedAt,
        finishedAt,
        feelingScore: payload.feelingScore,
        feelingNotes: trimmedFeelingNotes,
      },
    });

    if (
      rescheduledFromLocalDate &&
      rescheduledToLocalDate &&
      rescheduledFromLocalDate !== rescheduledToLocalDate
    ) {
      const reason = payload.rescheduleReason?.trim();

      await db.userActivityLog.create({
        data: {
          userId: user.id,
          action: "WORKOUT_RESCHEDULED",
          metadata: {
            sessionId,
            fromLocalDate: rescheduledFromLocalDate,
            toLocalDate: rescheduledToLocalDate,
            movedAt: new Date().toISOString(),
            reason: reason || null,
          },
        },
      });
    }

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
