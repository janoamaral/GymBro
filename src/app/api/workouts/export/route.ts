import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getOrCreateCurrentUser } from "@/lib/current-user";
import { UnauthorizedError } from "@/lib/http-errors";

function isExerciseOrderUnsupported(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Unknown argument `exerciseOrder`/i.test(error.message);
}

function parseMonth(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = typeof value === "string" ? value : String(value);

  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

function decimalToString(value: { toString: () => string } | null | undefined): string {
  if (value === null || value === undefined) {
    return "";
  }

  const str = value.toString();
  return str === "0" ? str : str;
}

const CSV_HEADERS = [
  "fecha",
  "sesion",
  "ejercicio",
  "lift_id",
  "set_number",
  "reps_target",
  "reps_done",
  "peso_objetivo",
  "unidad",
  "peso_barra",
  "peso_por_lado",
  "e1rm",
  "is_amrap",
  "is_done",
  "rpe",
  "rir",
  "set_feeling_score",
  "session_feeling_score",
  "session_feeling_notes",
];

function buildCsvRow(values: unknown[]): string {
  return values.map(escapeCsv).join(",");
}

export async function GET(request: Request) {
  try {
    const user = await getOrCreateCurrentUser();
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");

    if (!month) {
      return NextResponse.json({ error: "MISSING_MONTH" }, { status: 400 });
    }

    const monthParts = parseMonth(month);
    if (!monthParts) {
      return NextResponse.json({ error: "INVALID_MONTH_FORMAT" }, { status: 400 });
    }

    const { year, month: monthNumber } = monthParts;
    const fromDate = new Date(Date.UTC(year, monthNumber - 1, 1, 0, 0, 0, 0));
    const toDate = new Date(
      Date.UTC(year, monthNumber - 1, lastDayOfMonth(year, monthNumber), 23, 59, 59, 999),
    );

    let sessions;

    try {
      sessions = await db.workoutSession.findMany({
        where: {
          userId: user.id,
          startedAt: { gte: fromDate, lte: toDate },
        },
        orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
        include: {
          sets: {
            orderBy: [
              { exerciseOrder: "asc" },
              { setNumber: "asc" },
              { createdAt: "asc" },
            ],
            include: {
              exercise: true,
            },
          },
        },
      });
    } catch (error) {
      if (!isExerciseOrderUnsupported(error)) {
        throw error;
      }

      sessions = await db.workoutSession.findMany({
        where: {
          userId: user.id,
          startedAt: { gte: fromDate, lte: toDate },
        },
        orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }],
        include: {
          sets: {
            orderBy: [{ setNumber: "asc" }, { createdAt: "asc" }],
            include: {
              exercise: true,
            },
          },
        },
      });
    }

    const rows: string[] = [buildCsvRow(CSV_HEADERS)];

    for (const session of sessions) {
      const fecha = session.startedAt.toISOString();
      const sessionTitle = session.title;
      const sessionFeelingScore = session.feelingScore;
      const sessionFeelingNotes = session.feelingNotes;

      for (const set of session.sets) {
        rows.push(
          buildCsvRow([
            fecha,
            sessionTitle,
            set.exercise.name,
            set.liftId ?? "",
            set.setNumber,
            set.repsTarget,
            set.repsDone ?? "",
            decimalToString(set.targetWeight),
            set.unit,
            decimalToString(set.barbellWeight),
            decimalToString(set.perSideWeight),
            decimalToString(set.e1rm),
            set.isAmrap ? "true" : "false",
            set.isDone ? "true" : "false",
            set.rpe ?? "",
            set.rir ?? "",
            set.setFeelingScore ?? "",
            sessionFeelingScore ?? "",
            sessionFeelingNotes ?? "",
          ]),
        );
      }
    }

    const csv = rows.join("\n");
    const filename = `gymbro-${year}-${String(monthNumber).padStart(2, "0")}.csv`;

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      {
        error: "FAILED_TO_EXPORT_WORKOUTS",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
