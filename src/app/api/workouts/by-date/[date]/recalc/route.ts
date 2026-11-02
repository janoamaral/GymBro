import { NextResponse } from "next/server";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";
import { getSessionRecalculation } from "@/lib/training/session-recalculation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
) {
  try {
    const user = await getOrCreateCurrentUser();
    const { date } = await params;
    const recalculation = await getSessionRecalculation(user.id, date);
    return NextResponse.json({ recalculation });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof Error && error.message === "INVALID_DATE_FORMAT") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      {
        error: "FAILED_TO_RECALCULATE_SESSION",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
