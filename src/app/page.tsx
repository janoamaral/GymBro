"use client";

import { useMemo, useState } from "react";
import {
  calculatePlateLoadPerSide,
  suggestPlatesPerSide,
} from "@/lib/training/plate-calculator";
import { formatDualWeight, type WeightUnit } from "@/lib/units/conversion";

export default function Home() {
  const [unit, setUnit] = useState<WeightUnit>("kg");
  const [targetWeight, setTargetWeight] = useState(120);
  const [barbellWeight, setBarbellWeight] = useState(20);

  const calculation = useMemo(() => {
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

    return suggestPlatesPerSide(calculation.result.roundedPerSide, unit);
  }, [calculation.result, unit]);

  const targetDual = formatDualWeight(targetWeight, unit);

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6 sm:py-10">
      <section className="panel accent-glow rounded-3xl p-5 sm:p-6">
        <p className="text-xs tracking-[0.2em] text-muted">GymBro</p>
        <h1 className="mt-2 text-5xl leading-none text-accent sm:text-6xl">Plate Calc</h1>
        <p className="mt-2 text-sm text-muted">Know exactly how much to load on each side of the bar.</p>

        <div className="mt-4 flex items-center gap-2 text-xs uppercase tracking-[0.1em]">
          <a href="/auth/login" className="rounded-full border border-accent/40 px-3 py-1 text-foreground">
            Log in
          </a>
          <a href="/auth/logout" className="rounded-full border border-accent/20 px-3 py-1 text-muted">
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
    </main>
  );
}
