import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();
    const now = new Date();

    // Get the next upcoming session (not finished, startedAt >= now)
    const session = await db.workoutSession.findFirst({
      where: {
        userId: user.id,
        startedAt: {
          gte: now,
        },
        finishedAt: null,
      },
      orderBy: {
        startedAt: "asc",
      },
      include: {
        sets: {
          orderBy: { setNumber: "asc" },
          include: {
            exercise: true,
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ session: null });
    }

    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_NEXT_WORKOUT",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
