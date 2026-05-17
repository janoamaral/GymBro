import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

const updateSettingsSchema = z.object({
  cycleIncrement531: z.number().positive().optional(),
});

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();

    const settings = {
      cycleIncrement531: user.cycleIncrement531,
    };

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_SETTINGS",
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
    const payload = updateSettingsSchema.parse(body);

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        cycleIncrement531: payload.cycleIncrement531,
      },
    });

    const settings = {
      cycleIncrement531: updated.cycleIncrement531,
    };

    return NextResponse.json({ settings });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_UPDATE_SETTINGS",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
