import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

const upsertProfileSchema = z.object({
  liftId: z.enum(["SQ", "DL", "BP", "OHP"]),
  oneRm: z.number().positive(),
  cycleNumber: z.number().int().min(1),
  unit: z.enum(["kg", "lb"]),
});

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();

    const profiles = await db.training531Profile.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ profiles });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_531_PROFILES",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const body = await request.json();
    const payload = upsertProfileSchema.parse(body);

    const profile = await db.training531Profile.upsert({
      where: {
        userId_liftId: {
          userId: user.id,
          liftId: payload.liftId,
        },
      },
      update: {
        oneRm: payload.oneRm,
        cycleNumber: payload.cycleNumber,
        unit: payload.unit,
      },
      create: {
        userId: user.id,
        liftId: payload.liftId,
        oneRm: payload.oneRm,
        cycleNumber: payload.cycleNumber,
        unit: payload.unit,
      },
    });

    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_SAVE_531_PROFILE",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
