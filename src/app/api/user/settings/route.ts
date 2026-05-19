import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

const updateSettingsSchema = z.object({
  cycleIncrement531: z.number().positive().optional(),
  displayName: z.string().trim().max(80).optional(),
  avatarUrl: z.string().trim().max(500).optional(),
  defaultUnit: z.enum(["kg", "lb"]).optional(),
  competitionSex: z.enum(["male", "female"]).optional(),
});

type CompetitionSettingsMetadata = {
  sex?: unknown;
};

type UpdateSettingsPayload = z.infer<typeof updateSettingsSchema>;

function isValidAbsoluteUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeNullableString(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value.length === 0 ? null : value;
}

function getValidatedUpdateInput(payload: UpdateSettingsPayload): {
  nextDisplayName: string | null | undefined;
  nextAvatarUrl: string | null | undefined;
  invalidAvatarResponse: NextResponse | null;
} {
  const nextDisplayName = normalizeNullableString(payload.displayName);
  const nextAvatarUrl = normalizeNullableString(payload.avatarUrl);

  if (nextAvatarUrl !== null && nextAvatarUrl !== undefined && !isValidAbsoluteUrl(nextAvatarUrl)) {
    return {
      nextDisplayName,
      nextAvatarUrl,
      invalidAvatarResponse: NextResponse.json(
        { error: "INVALID_PAYLOAD", issues: [{ path: ["avatarUrl"], message: "Invalid URL" }] },
        { status: 400 },
      ),
    };
  }

  return {
    nextDisplayName,
    nextAvatarUrl,
    invalidAvatarResponse: null,
  };
}

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();
    const latestCompetitionSettings = await db.userActivityLog.findFirst({
      where: {
        userId: user.id,
        action: "USER_COMPETITION_SETTINGS",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const competitionMetadata = (latestCompetitionSettings?.metadata ?? {}) as CompetitionSettingsMetadata;
    const competitionSex = competitionMetadata.sex === "female" ? "female" : "male";

    const settings = {
      cycleIncrement531: user.cycleIncrement531,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      defaultUnit: user.defaultUnit,
      competitionSex,
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
    const { nextDisplayName, nextAvatarUrl, invalidAvatarResponse } = getValidatedUpdateInput(payload);

    if (invalidAvatarResponse) {
      return invalidAvatarResponse;
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        cycleIncrement531: payload.cycleIncrement531,
        displayName: nextDisplayName,
        avatarUrl: nextAvatarUrl,
        defaultUnit: payload.defaultUnit,
      },
    });

    if (payload.competitionSex !== undefined) {
      await db.userActivityLog.create({
        data: {
          userId: user.id,
          action: "USER_COMPETITION_SETTINGS",
          metadata: {
            sex: payload.competitionSex,
          },
        },
      });
    }

    const settings = {
      cycleIncrement531: updated.cycleIncrement531,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      defaultUnit: updated.defaultUnit,
      competitionSex: payload.competitionSex ?? "male",
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
