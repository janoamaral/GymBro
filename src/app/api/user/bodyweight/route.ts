import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

const createMeasurementSchema = z.object({
  weight: z.number().positive(),
  unit: z.enum(["kg", "lb"]),
  measuredAt: z.string().optional(),
});

type MeasurementMetadata = {
  weight?: unknown;
  unit?: unknown;
};

type BodyweightMeasurement = {
  id: string;
  weight: number;
  unit: "kg" | "lb";
  measuredAt: string;
};

function toMeasurement(log: {
  id: string;
  createdAt: Date;
  metadata: unknown;
}): BodyweightMeasurement | null {
  const metadata = (log.metadata ?? {}) as MeasurementMetadata;
  const weight = Number(metadata.weight);
  const unit = metadata.unit;

  if (!Number.isFinite(weight) || weight <= 0) {
    return null;
  }

  if (unit !== "kg" && unit !== "lb") {
    return null;
  }

  return {
    id: log.id,
    weight,
    unit,
    measuredAt: log.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    const user = await getOrCreateCurrentUser();

    const logs = await db.userActivityLog.findMany({
      where: {
        userId: user.id,
        action: "BODYWEIGHT_MEASUREMENT",
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 30,
    });

    const measurements = logs
      .map((log) => toMeasurement(log))
      .filter((item): item is BodyweightMeasurement => item !== null);

    return NextResponse.json({
      latest: measurements[0] ?? null,
      measurements,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_FETCH_BODYWEIGHT",
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
    const payload = createMeasurementSchema.parse(body);

    const measuredAt = payload.measuredAt ? new Date(payload.measuredAt) : new Date();
    if (Number.isNaN(measuredAt.getTime())) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: [{ path: ["measuredAt"], message: "Invalid date" }] }, { status: 400 });
    }

    const created = await db.userActivityLog.create({
      data: {
        userId: user.id,
        action: "BODYWEIGHT_MEASUREMENT",
        createdAt: measuredAt,
        metadata: {
          weight: payload.weight,
          unit: payload.unit,
        },
      },
    });

    const measurement = toMeasurement({
      id: created.id,
      createdAt: created.createdAt,
      metadata: created.metadata,
    });

    return NextResponse.json({ measurement }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_SAVE_BODYWEIGHT",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
