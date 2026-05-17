import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";

const createWorkoutSchema = z.object({
  title: z.string().min(1).max(120),
});

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();

    const sessions = await db.workoutSession.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        sets: {
          orderBy: [{ createdAt: "asc" }],
          include: {
            exercise: true,
          },
        },
      },
      take: 20,
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_WORKOUTS",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const body = await request.json();
    const payload = createWorkoutSchema.parse(body);

    const session = await db.workoutSession.create({
      data: {
        userId: user.id,
        title: payload.title.trim(),
      },
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_CREATE_WORKOUT",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
