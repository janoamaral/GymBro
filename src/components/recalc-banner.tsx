'use client';

import { useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import type { RecalcResult } from '@/lib/training/531';

export type RecalculationView = RecalcResult & {
  sessionId: string;
  liftId: 'SQ' | 'DL' | 'BP';
  unit: 'kg' | 'lb';
};

type Props = {
  recalculation: RecalculationView;
  deciding: boolean;
  onDecision: (accepted: boolean) => void;
};

function tonnage(sets: Array<{ targetWeight: number; repsTarget: number }>): number {
  return sets.reduce((total, set) => total + set.targetWeight * set.repsTarget, 0);
}

export function RecalcBanner({ recalculation, deciding, onDecision }: Props) {
  const [expanded, setExpanded] = useState(false);
  const suggestedById = new Map(recalculation.suggestedSets.map((set) => [set.id, set]));
  const originalTonnage = recalculation.originalSets.reduce(
    (total, set) => total + set.weight * set.reps,
    0,
  );
  const suggestedTonnage = tonnage(recalculation.suggestedSets);

  return (
    <section className="panel-soft mb-6 overflow-hidden rounded-2xl border border-[#d6ff43]/25">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left"
        aria-expanded={expanded}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d6ff43]/12 text-[#d6ff43]">
          <Sparkles size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.2em] text-[#d6ff43]">
            Ajuste {recalculation.level.toLowerCase()}
          </span>
          <span className="mt-1 block truncate text-sm text-gray-300">
            {recalculation.reasons.at(-1)}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={`text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-white/8 px-4 pb-4 pt-3">
          <div className="mb-3 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl bg-black/20 p-2">
              <span className="block text-gray-500">Sets</span>
              <strong className="text-white">
                {recalculation.originalSets.length} → {recalculation.suggestedSets.length}
              </strong>
            </div>
            <div className="rounded-xl bg-black/20 p-2">
              <span className="block text-gray-500">Volumen</span>
              <strong className="text-white">
                {Math.round(originalTonnage)} → {Math.round(suggestedTonnage)}
              </strong>
            </div>
            <div className="rounded-xl bg-black/20 p-2">
              <span className="block text-gray-500">Lift</span>
              <strong className="text-white">{recalculation.liftId}</strong>
            </div>
          </div>

          <div className="space-y-2">
            {recalculation.originalSets.map((original) => {
              const suggested = suggestedById.get(original.id);
              if (!suggested) {
                return (
                  <div key={original.id ?? original.setNumber} className="flex justify-between rounded-xl bg-black/20 px-3 py-2 text-sm">
                    <span className="text-gray-400">Set {original.setNumber}</span>
                    <span className="text-gray-400 line-through">eliminado</span>
                  </div>
                );
              }
              const changed =
                Math.abs(suggested.targetWeight - original.weight) / Math.max(original.weight, 1) >= 0.01 ||
                suggested.repsTarget !== original.reps;
              return (
                <div key={original.id ?? original.setNumber} className="flex items-center justify-between rounded-xl bg-black/20 px-3 py-2 text-sm">
                  <span className="text-gray-400">Set {original.setNumber}</span>
                  <span className={changed ? 'font-semibold text-[#d6ff43]' : 'text-gray-400'}>
                    {original.weight}{recalculation.unit} × {original.reps}
                    {' → '}
                    {suggested.targetWeight}{recalculation.unit} × {suggested.repsTarget}
                  </span>
                </div>
              );
            })}
          </div>

          <ul className="mt-3 space-y-1 text-xs text-gray-400">
            {recalculation.reasons.map((reason) => <li key={reason}>• {reason}</li>)}
          </ul>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" className="btn-dark px-3 py-2 text-sm" disabled={deciding} onClick={() => onDecision(false)}>
              Plan original
            </button>
            <button type="button" className="btn-accent px-3 py-2 text-sm font-semibold" disabled={deciding} onClick={() => onDecision(true)}>
              {deciding ? 'Guardando…' : 'Aceptar ajuste'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
