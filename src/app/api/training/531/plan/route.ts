import { NextResponse } from "next/server";
import { z } from "zod";
import { plan531Week } from "@/lib/training/531";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

const planSchema = z.object({
  liftId: z.enum(["SQ", "DL", "BP"]),
  oneRm: z.number().positive(),
  unit: z.enum(["kg", "lb"]),
  weekNumber: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  cycleNumber: z.number().int().min(1).default(1),
  roundingMode: z.enum(["nearest", "up", "down"]).default("nearest"),
  assistanceVariant: z.enum(["NONE", "BBB", "FSL"]).default("NONE"),
  bbbPercentage: z.number().min(0.3).max(0.7).default(0.5),
});

export async function POST(request: Request) {
  try {
    await getOrCreateCurrentUser();
    const body = await request.json();
    const payload = planSchema.parse(body);

    const plan = plan531Week(payload);
    return NextResponse.json({ plan });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "INVALID_PAYLOAD", issues: error.issues }, { status: 400 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_GENERATE_531_PLAN",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
