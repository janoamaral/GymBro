import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

type WeightUnit = "kg" | "lb";
type MeetSex = "male" | "female";
type MeasurementMetadata = {
  weight?: unknown;
  unit?: unknown;
};
type CompetitionSettingsMetadata = {
  sex?: unknown;
};

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeUnit(value: unknown, fallback: WeightUnit): WeightUnit {
  return value === "lb" ? "lb" : fallback;
}

function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) {
    return value;
  }

  if (from === "kg" && to === "lb") {
    return value * 2.2046226218;
  }

  return value / 2.2046226218;
}

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();

    const [profiles, latestMeasurementLog, latestCompetitionSettings] = await Promise.all([
      db.training531Profile.findMany({
        where: { userId: user.id },
      }),
      db.userActivityLog.findFirst({
        where: {
          userId: user.id,
          action: "BODYWEIGHT_MEASUREMENT",
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
      db.userActivityLog.findFirst({
        where: {
          userId: user.id,
          action: "USER_COMPETITION_SETTINGS",
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    const mapByLift = new Map(profiles.map((profile) => [profile.liftId, profile]));
    const settingsMetadata = (latestCompetitionSettings?.metadata ?? {}) as CompetitionSettingsMetadata;
    const configuredSex: MeetSex = settingsMetadata.sex === "female" ? "female" : "male";
    const configuredUnit = safeUnit(user.defaultUnit, "kg");

    const metadata = (latestMeasurementLog?.metadata ?? {}) as MeasurementMetadata;
    const measurementUnit = safeUnit(metadata.unit, configuredUnit);
    const bodyweightRaw = toNumber(metadata.weight, 0);
    const bodyweight = bodyweightRaw > 0 ? Number(convertWeight(bodyweightRaw, measurementUnit, configuredUnit).toFixed(2)) : 0;

    const payload = {
      squat: toNumber(mapByLift.get("SQ")?.oneRm, 220),
      bench: toNumber(mapByLift.get("BP")?.oneRm, 150),
      deadlift: toNumber(mapByLift.get("DL")?.oneRm, 260),
      bodyweight,
      sex: configuredSex,
      unit: configuredUnit,
      source: {
        fromPlan: true,
        fromBodyweightMeasurement: latestMeasurementLog !== null,
        measurementUnit,
      },
    };

    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_LOAD_COEFFICIENTS_CONTEXT",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
