import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

const updateSettingsSchema = z.object({
  cycleIncrement531: z.number().positive().optional(),
  displayName: z.string().trim().max(80).optional(),
  avatarUrl: z.string().trim().max(500).optional(),
});

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();

    const settings = {
      cycleIncrement531: user.cycleIncrement531,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
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
    let nextDisplayName: string | null | undefined = undefined;
    if (payload.displayName !== undefined) {
      nextDisplayName = payload.displayName.length === 0 ? null : payload.displayName;
    }

    let nextAvatarUrl: string | null | undefined = undefined;
    if (payload.avatarUrl !== undefined) {
      nextAvatarUrl = payload.avatarUrl.length === 0 ? null : payload.avatarUrl;
    }

    if (nextAvatarUrl !== null && nextAvatarUrl !== undefined && !URL.canParse(nextAvatarUrl)) {
      return NextResponse.json(
        { error: "INVALID_PAYLOAD", issues: [{ path: ["avatarUrl"], message: "Invalid URL" }] },
        { status: 400 },
      );
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        cycleIncrement531: payload.cycleIncrement531,
        displayName: nextDisplayName,
        avatarUrl: nextAvatarUrl,
      },
    });

    const settings = {
      cycleIncrement531: updated.cycleIncrement531,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
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
