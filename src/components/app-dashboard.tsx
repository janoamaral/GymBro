"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  calculatePlateLoadPerSide,
  suggestPlatesPerSide,
} from "@/lib/training/plate-calculator";
import { formatDualWeight, type WeightUnit } from "@/lib/units/conversion";
import { fetchJsonWithInFlightDedup } from "@/lib/fetch-json-with-in-flight-dedup";

type LiftId = "SQ" | "DL" | "BP";
type AssistanceVariant = "NONE" | "BBB" | "FSL";

type WeekNumber = 1 | 2 | 3 | 4;

type Planned531Set = {
  setNumber: number;
  weight: number;
  reps: number;
  percentage: number;
  isAmrap: boolean;
  block: "MAIN" | "ASSISTANCE";
  assistanceVariant?: "BBB" | "FSL";
};

type Planned531Week = {
  liftId: LiftId;
  cycleNumber: number;
  weekNumber: WeekNumber;
  label: string;
  unit: WeightUnit;
  tm: number;
  sets: Planned531Set[];
  assistanceVariant: AssistanceVariant;
  assistanceSets: Planned531Set[];
};

type Profile531 = {
  liftId: LiftId;
  oneRm: string;
  cycleNumber: number;
  unit: WeightUnit;
};

type ProgressPoint531 = {
  id: string;
  date: string;
  e1rm: number;
  repsDone: number | null;
  repsTarget: number;
  targetWeight: number;
  amrapStatus: string | null;
  unit: WeightUnit;
};

type WorkoutSet = {
  id: string;
  liftId: LiftId | null;
  setNumber: number;
  repsTarget: number;
  repsDone: number | null;
  isAmrap: boolean;
  targetWeight: string;
  perSideWeight: string | null;
  e1rm: string | null;
  amrapStatus: string | null;
  unit: WeightUnit;
  exercise: {
    id: string;
    name: string;
  };
};

type WorkoutSession = {
  id: string;
  title: string;
  createdAt: string;
  finishedAt: string | null;
  feelingScore: number | null;
  feelingNotes: string | null;
  sets: WorkoutSet[];
};

type Props = {
  userName: string;
  userPicture: string | null;
};

const KG_PLATE_OPTIONS = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

export default function AppDashboard({ userName, userPicture }: Props) {
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [targetWeight, setTargetWeight] = useState(120);
  const [barbellWeight, setBarbellWeight] = useState(20);
  const [workoutTitle, setWorkoutTitle] = useState("Upper A");
  const [exerciseName, setExerciseName] = useState("Bench Press");
  const [repsTarget, setRepsTarget] = useState(5);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feelingScore, setFeelingScore] = useState(7);
  const [feelingNotes, setFeelingNotes] = useState("Strong and focused.");
  const [liftId, setLiftId] = useState<LiftId>("BP");
  const [oneRm, setOneRm] = useState(100);
  const [weekNumber, setWeekNumber] = useState<WeekNumber>(1);
  const [cycleNumber, setCycleNumber] = useState(1);
  const [planned531, setPlanned531] = useState<Planned531Week | null>(null);
  const [assistanceVariant, setAssistanceVariant] = useState<AssistanceVariant>("NONE");
  const [bbbPercentage, setBbbPercentage] = useState(0.5);
  const [progress531Points, setProgress531Points] = useState<ProgressPoint531[]>([]);
  const [progress531Tm, setProgress531Tm] = useState<number | null>(null);
  const [profiles531, setProfiles531] = useState<Record<LiftId, Profile531 | undefined>>({
    SQ: undefined,
    DL: undefined,
    BP: undefined,
  });
  const [availablePlatesKg, setAvailablePlatesKg] = useState<number[]>([...KG_PLATE_OPTIONS]);

  const calculation = useMemo(() => {
    if (targetWeight > 0 && barbellWeight > 0 && targetWeight < barbellWeight) {
      return {
        error: null,
        result: {
          perSide: 0,
          roundedPerSide: 0,
          totalFromBarAndPlates: targetWeight,
          differenceFromTarget: 0,
          unit,
        },
      };
    }

    try {
      return {
        error: null,
        result: calculatePlateLoadPerSide({ targetWeight, barbellWeight, unit }),
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "UNKNOWN_ERROR",
        result: null,
      };
    }
  }, [targetWeight, barbellWeight, unit]);

  const plateSuggestion = useMemo(() => {
    if (!calculation.result) {
      return [];
    }

    return suggestPlatesPerSide(
      calculation.result.roundedPerSide,
      unit,
      unit === "kg" ? availablePlatesKg : undefined,
    );
  }, [calculation.result, unit, availablePlatesKg]);

  const targetDual = formatDualWeight(targetWeight, unit);

  async function loadSessions() {
    const data = await fetchJsonWithInFlightDedup<{ sessions: WorkoutSession[] }>("/api/workouts");

    const loadedSessions = data.sessions;
    setSessions(loadedSessions);
    setSelectedSessionId((current) => current ?? loadedSessions[0]?.id ?? null);
  }

  async function load531Profiles() {
    const data = await fetchJsonWithInFlightDedup<{ profiles: Profile531[] }>("/api/training/531/profile");

    const nextProfiles: Record<LiftId, Profile531 | undefined> = {
      SQ: undefined,
      DL: undefined,
      BP: undefined,
    };

    for (const profile of data.profiles) {
      nextProfiles[profile.liftId] = profile;
    }

    setProfiles531(nextProfiles);
  }

  async function loadUserSettings() {
    const data = await fetchJsonWithInFlightDedup<{ settings?: { availablePlatesKg?: number[] } }>("/api/user/settings");
    const platesFromSettings = data.settings?.availablePlatesKg;

    const fetchedPlates = Array.isArray(platesFromSettings)
      ? platesFromSettings
      : [...KG_PLATE_OPTIONS];

    setAvailablePlatesKg(KG_PLATE_OPTIONS.filter((plate) => fetchedPlates.includes(plate)));
  }

  async function load531Progress(nextLiftId: LiftId) {
    const data = await fetchJsonWithInFlightDedup<{ points: ProgressPoint531[]; currentTm: number | null }>(
      `/api/training/531/progress?liftId=${nextLiftId}`
    );

    setProgress531Points(data.points);
    setProgress531Tm(data.currentTm);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadSessions().catch((error) => {
        setApiError(error instanceof Error ? error.message : "FAILED_TO_LOAD_SESSIONS");
      });
      load531Profiles().catch((error) => {
        setApiError(error instanceof Error ? error.message : "FAILED_TO_LOAD_531_PROFILES");
      });
      loadUserSettings().catch((error) => {
        setApiError(error instanceof Error ? error.message : "FAILED_TO_LOAD_SETTINGS");
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const profile = profiles531[liftId];

    if (!profile) {
      return;
    }

    const timer = window.setTimeout(() => {
      setOneRm(Number(profile.oneRm));
      setCycleNumber(profile.cycleNumber);
      setUnit(profile.unit);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [liftId, profiles531]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load531Progress(liftId).catch((error) => {
        setApiError(error instanceof Error ? error.message : "FAILED_TO_LOAD_531_PROGRESS");
      });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [liftId]);

  async function handleCreateWorkout() {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const response = await fetch("/api/workouts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: workoutTitle }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "FAILED_TO_CREATE_WORKOUT");
      }

      setSelectedSessionId(data.session.id as string);
      await loadSessions();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "FAILED_TO_CREATE_WORKOUT");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAddSet() {
    if (!selectedSessionId) {
      setApiError("CREATE_A_WORKOUT_FIRST");
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      const response = await fetch(`/api/workouts/${selectedSessionId}/sets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exerciseName,
          repsTarget,
          targetWeight,
          barbellWeight,
          unit,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "FAILED_TO_ADD_SET");
      }

      await loadSessions();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "FAILED_TO_ADD_SET");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSessionUpdate(sessionId: string, payload: Record<string, unknown>) {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const response = await fetch(`/api/workouts/${sessionId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "FAILED_TO_UPDATE_WORKOUT");
      }

      await loadSessions();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "FAILED_TO_UPDATE_WORKOUT");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSetRepsDone(sessionId: string, setId: string, repsDone: number, logAsAmrap: boolean) {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const response = await fetch(`/api/workouts/${sessionId}/sets/${setId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ repsDone, logAsAmrap }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "FAILED_TO_UPDATE_SET");
      }

      await loadSessions();
      await load531Progress(liftId);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "FAILED_TO_UPDATE_SET");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGenerate531Plan() {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const response = await fetch("/api/training/531/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          liftId,
          oneRm,
          unit,
          weekNumber,
          cycleNumber,
          roundingMode: "nearest",
          assistanceVariant,
          bbbPercentage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "FAILED_TO_GENERATE_531_PLAN");
      }

      setPlanned531(data.plan as Planned531Week);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "FAILED_TO_GENERATE_531_PLAN");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleImport531Plan() {
    if (!selectedSessionId || !planned531) {
      setApiError("SELECT_SESSION_AND_GENERATE_PLAN");
      return;
    }

    setIsSubmitting(true);
    setApiError(null);

    try {
      const response = await fetch(`/api/workouts/${selectedSessionId}/531/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          liftId,
          oneRm,
          unit,
          weekNumber,
          cycleNumber,
          roundingMode: "nearest",
          assistanceVariant,
          bbbPercentage,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "FAILED_TO_IMPORT_531_PLAN");
      }

      await loadSessions();
      await load531Progress(liftId);
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "FAILED_TO_IMPORT_531_PLAN");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSave531Profile() {
    setIsSubmitting(true);
    setApiError(null);

    try {
      const response = await fetch("/api/training/531/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          liftId,
          oneRm,
          cycleNumber,
          unit,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "FAILED_TO_SAVE_531_PROFILE");
      }

      await load531Profiles();
    } catch (error) {
      setApiError(error instanceof Error ? error.message : "FAILED_TO_SAVE_531_PROFILE");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-md flex-1 space-y-4 px-4 py-6 sm:py-10">
      <section className="panel accent-glow rounded-3xl p-5 sm:p-6">
        <p className="text-xs tracking-[0.2em] text-muted">GymBro</p>
        <h1 className="mt-2 text-5xl leading-none text-accent sm:text-6xl">Plate Calc</h1>
        <p className="mt-2 text-sm text-muted">Know exactly how much to load on each side of the bar.</p>

        <div className="mt-4 flex items-center gap-3">
          {userPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={userPicture}
              alt={userName}
              className="h-8 w-8 rounded-full border border-accent/30 object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/30 bg-[#1a1a1a] text-xs font-semibold text-accent">
              {userName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="flex-1 truncate text-sm text-foreground">{userName}</span>
          <a
            href="/auth/logout"
            className="rounded-full border border-accent/20 px-3 py-1 text-xs uppercase tracking-[0.08em] text-muted hover:border-accent/40 hover:text-foreground"
          >
            Log out
          </a>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-[#080808] p-1">
          <button
            type="button"
            onClick={() => setUnit("kg")}
            className={`h-11 rounded-xl text-lg font-semibold uppercase transition ${
              unit === "kg" ? "bg-accent text-black" : "text-foreground"
            }`}
          >
            KG
          </button>
          <button
            type="button"
            onClick={() => setUnit("lb")}
            className={`h-11 rounded-xl text-lg font-semibold uppercase transition ${
              unit === "lb" ? "bg-accent text-black" : "text-foreground"
            }`}
          >
            LB
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block">
            <span className="text-lg text-foreground">Target weight ({unit})</span>
            <input
              value={Number.isNaN(targetWeight) ? "" : targetWeight}
              onChange={(event) => setTargetWeight(Number(event.target.value))}
              type="number"
              min={0}
              step={unit === "kg" ? 0.5 : 1}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-2xl text-foreground outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs uppercase tracking-[0.08em] text-muted">
              {targetDual.secondaryText}
            </span>
          </label>

          <label className="block">
            <span className="text-lg text-foreground">Barbell weight ({unit})</span>
            <input
              value={Number.isNaN(barbellWeight) ? "" : barbellWeight}
              onChange={(event) => setBarbellWeight(Number(event.target.value))}
              type="number"
              min={0}
              step={unit === "kg" ? 0.5 : 1}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-2xl text-foreground outline-none focus:border-accent"
            />
            <span className="mt-1 block text-xs uppercase tracking-[0.08em] text-muted">
              Suggested default: {unit === "kg" ? "20 kg" : "45 lb"}
            </span>
          </label>
        </div>

        {calculation.error ? (
          <p className="mt-5 rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-300">
            Cannot calculate: {calculation.error}
          </p>
        ) : (
          <div className="mt-6 rounded-2xl border border-accent/30 bg-black/40 p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Load per side</p>
            <p className="mt-1 text-6xl leading-none text-accent">{calculation.result?.perSide}</p>
            <p className="mt-1 text-xl uppercase text-foreground">{unit} each side</p>
            <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted">
              Rounded loading target: {calculation.result?.roundedPerSide} {unit} each side
            </p>
            <p className="mt-2 text-xs uppercase tracking-[0.08em] text-muted">
              Total assembled: {calculation.result?.totalFromBarAndPlates} {unit}
            </p>
          </div>
        )}

        {calculation.result ? (
          <div className="mt-5">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">Suggested plates per side</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {plateSuggestion.length > 0 ? (
                plateSuggestion.map((plate, index) => (
                  <span
                    key={`${plate}-${index}`}
                    className="rounded-full border border-accent/40 px-3 py-1 text-sm text-foreground"
                  >
                    {plate} {unit}
                  </span>
                ))
              ) : (
                <span className="text-sm text-muted">No plates needed.</span>
              )}
            </div>
          </div>
        ) : null}
      </section>

      <section className="panel rounded-3xl p-5 sm:p-6">
        <h2 className="text-3xl text-accent">Workout Logger</h2>
        <p className="mt-1 text-sm text-muted">Create sessions and save sets directly in Neon.</p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-lg text-foreground">Session title</span>
            <input
              value={workoutTitle}
              onChange={(event) => setWorkoutTitle(event.target.value)}
              type="text"
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-xl text-foreground outline-none focus:border-accent"
            />
          </label>

          <button
            type="button"
            onClick={handleCreateWorkout}
            disabled={isSubmitting || workoutTitle.trim().length === 0}
            className="h-11 w-full rounded-xl bg-accent text-lg font-semibold text-black disabled:opacity-50"
          >
            Create Workout Session
          </button>
        </div>

        <div className="mt-5">
          <label className="block">
            <span className="text-lg text-foreground">Active session</span>
            <select
              value={selectedSessionId ?? ""}
              onChange={(event) => setSelectedSessionId(event.target.value || null)}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-lg text-foreground outline-none focus:border-accent"
            >
              <option value="">Select session</option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-lg text-foreground">Exercise name</span>
            <input
              value={exerciseName}
              onChange={(event) => setExerciseName(event.target.value)}
              type="text"
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-xl text-foreground outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-lg text-foreground">Target reps</span>
            <input
              value={Number.isNaN(repsTarget) ? "" : repsTarget}
              onChange={(event) => setRepsTarget(Number(event.target.value))}
              type="number"
              min={1}
              max={100}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-xl text-foreground outline-none focus:border-accent"
            />
          </label>

          <button
            type="button"
            onClick={handleAddSet}
            disabled={
              isSubmitting ||
              !selectedSessionId ||
              exerciseName.trim().length === 0 ||
              repsTarget < 1 ||
              !calculation.result
            }
            className="h-11 w-full rounded-xl bg-accent text-lg font-semibold text-black disabled:opacity-50"
          >
            Add Set To Session
          </button>

          <label className="block">
            <span className="text-lg text-foreground">Feeling score (1-10)</span>
            <input
              value={Number.isNaN(feelingScore) ? "" : feelingScore}
              onChange={(event) => setFeelingScore(Number(event.target.value))}
              type="number"
              min={1}
              max={10}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-xl text-foreground outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-lg text-foreground">Feeling notes</span>
            <textarea
              value={feelingNotes}
              onChange={(event) => setFeelingNotes(event.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-[#333] bg-[#050505] px-4 py-3 text-base text-foreground outline-none focus:border-accent"
            />
          </label>

          <button
            type="button"
            disabled={isSubmitting || !selectedSessionId || feelingScore < 1 || feelingScore > 10}
            onClick={() => {
              if (!selectedSessionId) return;
              handleSessionUpdate(selectedSessionId, {
                feelingScore,
                feelingNotes,
              });
            }}
            className="h-11 w-full rounded-xl border border-accent/40 text-lg font-semibold text-foreground disabled:opacity-50"
          >
            Save Feeling
          </button>

          <button
            type="button"
            disabled={isSubmitting || !selectedSessionId}
            onClick={() => {
              if (!selectedSessionId) return;
              const active = sessions.find((session) => session.id === selectedSessionId);
              handleSessionUpdate(selectedSessionId, {
                finishedAt: active?.finishedAt ? null : new Date().toISOString(),
              });
            }}
            className="h-11 w-full rounded-xl border border-accent/40 text-lg font-semibold text-foreground disabled:opacity-50"
          >
            Toggle Session Closed
          </button>
        </div>

        {apiError ? (
          <p className="mt-4 rounded-xl border border-red-500/40 bg-red-950/20 p-3 text-sm text-red-300">
            API error: {apiError}
          </p>
        ) : null}

        <div className="mt-5 space-y-3">
          {sessions.length === 0 ? (
            <p className="text-sm text-muted">No sessions yet. Create one to start logging sets.</p>
          ) : (
            sessions.map((session) => (
              <article key={session.id} className="rounded-2xl border border-accent/20 bg-black/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-heading text-2xl text-foreground">{session.title}</p>
                  <p className="text-xs uppercase tracking-[0.08em] text-muted">{session.sets.length} sets</p>
                </div>
                <p className="mt-1 text-xs uppercase tracking-[0.08em] text-muted">
                  {session.finishedAt ? "Closed" : "Open"} | Feeling: {session.feelingScore ?? "-"}
                </p>
                {session.feelingNotes ? (
                  <p className="mt-1 text-sm text-muted">{session.feelingNotes}</p>
                ) : null}
                <div className="mt-2 space-y-1">
                  {session.sets.length > 0 ? (
                    session.sets.map((set) => (
                      <div key={set.id} className="rounded-xl border border-accent/20 p-2">
                        <p className="text-sm text-foreground">
                          #{set.setNumber} {set.exercise.name} - target {set.repsTarget} reps - {set.targetWeight}{" "}
                          {set.unit}
                          {" / "}
                          side {set.perSideWeight ?? "-"} {set.unit}
                          {set.isAmrap ? " | AMRAP" : ""}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            max={100}
                            defaultValue={set.repsDone ?? ""}
                            placeholder="Reps done"
                            className="h-9 w-28 rounded-lg border border-[#333] bg-[#050505] px-2 text-sm text-foreground outline-none focus:border-accent"
                            onBlur={(event) => {
                              const value = Number(event.target.value);
                              if (!Number.isFinite(value) || value < 1) {
                                return;
                              }
                              handleSetRepsDone(session.id, set.id, value, set.isAmrap);
                            }}
                          />
                          <span className="text-xs uppercase tracking-[0.08em] text-muted">
                            logged: {set.repsDone ?? "-"}
                          </span>
                          {set.e1rm ? (
                            <span className="text-xs uppercase tracking-[0.08em] text-accent">
                              e1RM: {set.e1rm} {set.unit}
                            </span>
                          ) : null}
                          {set.amrapStatus ? (
                            <span className="text-xs uppercase tracking-[0.08em] text-muted">
                              {set.amrapStatus}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted">No sets yet.</p>
                  )}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="panel rounded-3xl p-5 sm:p-6">
        <h2 className="text-3xl text-accent">5/3/1 Engine</h2>
        <p className="mt-1 text-sm text-muted">Generate the week plan and import sets into the active session.</p>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-lg text-foreground">Lift</span>
            <select
              value={liftId}
              onChange={(event) => setLiftId(event.target.value as LiftId)}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-lg text-foreground outline-none focus:border-accent"
            >
              <option value="SQ">SQ</option>
              <option value="DL">DL</option>
              <option value="BP">BP</option>
            </select>
          </label>

          <label className="block">
            <span className="text-lg text-foreground">1RM ({unit})</span>
            <input
              value={Number.isNaN(oneRm) ? "" : oneRm}
              onChange={(event) => setOneRm(Number(event.target.value))}
              type="number"
              min={1}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-xl text-foreground outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-lg text-foreground">Week</span>
            <select
              value={weekNumber}
              onChange={(event) => setWeekNumber(Number(event.target.value) as WeekNumber)}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-lg text-foreground outline-none focus:border-accent"
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>

          <label className="block">
            <span className="text-lg text-foreground">Cycle</span>
            <input
              value={Number.isNaN(cycleNumber) ? "" : cycleNumber}
              onChange={(event) => setCycleNumber(Number(event.target.value))}
              type="number"
              min={1}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-xl text-foreground outline-none focus:border-accent"
            />
          </label>

          <label className="block">
            <span className="text-lg text-foreground">Assistance</span>
            <select
              value={assistanceVariant}
              onChange={(event) => setAssistanceVariant(event.target.value as AssistanceVariant)}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-lg text-foreground outline-none focus:border-accent"
            >
              <option value="NONE">None</option>
              <option value="BBB">BBB 5x10</option>
              <option value="FSL">FSL 5x5</option>
            </select>
          </label>

          <label className="block">
            <span className="text-lg text-foreground">BBB % TM</span>
            <input
              value={Number.isNaN(bbbPercentage) ? "" : bbbPercentage}
              onChange={(event) => setBbbPercentage(Number(event.target.value))}
              type="number"
              min={0.3}
              max={0.7}
              step={0.05}
              disabled={assistanceVariant !== "BBB"}
              className="mt-2 h-12 w-full rounded-xl border border-[#333] bg-[#050505] px-4 text-xl text-foreground outline-none focus:border-accent disabled:opacity-50"
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={handleSave531Profile}
            disabled={isSubmitting || oneRm <= 0 || cycleNumber < 1}
            className="h-11 w-full rounded-xl border border-accent/40 text-lg font-semibold text-foreground disabled:opacity-50"
          >
            Save Lift Profile
          </button>

          <button
            type="button"
            onClick={handleGenerate531Plan}
            disabled={isSubmitting || oneRm <= 0 || cycleNumber < 1}
            className="h-11 w-full rounded-xl bg-accent text-lg font-semibold text-black disabled:opacity-50"
          >
            Generate Week Plan
          </button>

          <button
            type="button"
            onClick={handleImport531Plan}
            disabled={isSubmitting || !selectedSessionId || !planned531}
            className="h-11 w-full rounded-xl border border-accent/40 text-lg font-semibold text-foreground disabled:opacity-50"
          >
            Import To Active Session
          </button>

          <button
            type="button"
            onClick={() => {
              load531Progress(liftId).catch((error) => {
                setApiError(error instanceof Error ? error.message : "FAILED_TO_LOAD_531_PROGRESS");
              });
            }}
            disabled={isSubmitting}
            className="h-11 w-full rounded-xl border border-accent/40 text-lg font-semibold text-foreground disabled:opacity-50"
          >
            Refresh Progress
          </button>
        </div>

        {profiles531[liftId] ? (
          <p className="mt-2 text-xs uppercase tracking-[0.08em] text-muted">
            Stored profile: 1RM {profiles531[liftId]?.oneRm} {profiles531[liftId]?.unit} | Cycle{" "}
            {profiles531[liftId]?.cycleNumber}
          </p>
        ) : (
          <p className="mt-2 text-xs uppercase tracking-[0.08em] text-muted">
            No stored profile for this lift yet.
          </p>
        )}

        {planned531 ? (
          <div className="mt-4 rounded-2xl border border-accent/20 bg-black/30 p-3">
            <p className="font-heading text-2xl text-foreground">{planned531.label}</p>
            <p className="text-xs uppercase tracking-[0.08em] text-muted">
              TM {planned531.tm} {planned531.unit} | Lift {planned531.liftId} | Cycle {planned531.cycleNumber}
            </p>

            <div className="mt-2 space-y-2">
              {planned531.sets.map((set) => (
                <div key={set.setNumber} className="rounded-xl border border-accent/20 p-2">
                  <p className="text-sm text-foreground">
                    Set {set.setNumber}: {set.weight} {planned531.unit} x {set.reps}
                    {set.isAmrap ? "+" : ""}
                  </p>
                  <p className="text-xs uppercase tracking-[0.08em] text-muted">
                    {(set.percentage * 100).toFixed(0)}% TM {set.isAmrap ? "| AMRAP" : ""}
                  </p>
                </div>
              ))}
            </div>

            {planned531.assistanceSets.length > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="text-xs uppercase tracking-[0.08em] text-muted">
                  Assistance {planned531.assistanceVariant}
                </p>
                {planned531.assistanceSets.map((set) => (
                  <div
                    key={`assist-${set.assistanceVariant}-${set.setNumber}`}
                    className="rounded-xl border border-accent/20 p-2"
                  >
                    <p className="text-sm text-foreground">
                      Set {set.setNumber}: {set.weight} {planned531.unit} x {set.reps}
                    </p>
                    <p className="text-xs uppercase tracking-[0.08em] text-muted">
                      {(set.percentage * 100).toFixed(0)}% TM
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-accent/20 bg-black/30 p-3">
          <p className="font-heading text-2xl text-foreground">E1RM Trend</p>
          <p className="text-xs uppercase tracking-[0.08em] text-muted">
            Lift {liftId} | Points: {progress531Points.length}
            {progress531Tm ? ` | Current TM ${progress531Tm} ${unit}` : ""}
          </p>

          {progress531Points.length > 0 ? (
            <div className="mt-3 h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={progress531Points.map((point) => ({
                    ...point,
                    label: new Date(point.date).toLocaleDateString("es-AR", {
                      month: "2-digit",
                      day: "2-digit",
                    }),
                  }))}
                  accessibilityLayer={false}
                  tabIndex={-1}
                >
                  <CartesianGrid stroke="#2b2b2b" strokeDasharray="3 3" />
                  <XAxis dataKey="label" stroke="#8b8b8b" />
                  <YAxis stroke="#8b8b8b" />
                  <Tooltip
                    contentStyle={{
                      background: "#0b0b0b",
                      border: "1px solid rgba(214, 255, 67, 0.3)",
                      borderRadius: 10,
                      color: "#f5f5f5",
                    }}
                  />
                  {progress531Tm ? (
                    <ReferenceLine y={progress531Tm} stroke="#d6ff43" strokeDasharray="6 4" />
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="e1rm"
                    stroke="#d6ff43"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#d6ff43" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted">No AMRAP/e1RM points yet for this lift.</p>
          )}
        </div>
      </section>
    </main>
  );
}
