import React from 'react';

const DOTS_LEVELS = [
  { label: 'Principiante', min: 0, max: 175 },
  { label: 'Intermedio', min: 175, max: 250 },
  { label: 'Avanzado', min: 250, max: 350 },
  { label: 'Elite', min: 350, max: 400 },
  { label: 'Internacional', min: 400, max: 450 },
  { label: 'World Class', min: 450, max: Infinity },
];

function getDotsLevel(dots: number) {
  return DOTS_LEVELS.find((l) => dots >= l.min && dots < l.max)?.label ?? 'Desconocido';
}

function getDotsLevelIndex(dots: number) {
  const found = DOTS_LEVELS.findIndex((l) => dots >= l.min && dots < l.max);
  return found >= 0 ? found : DOTS_LEVELS.length - 1;
}

export function DotsClassificationWidget({ dots }: Readonly<{ dots: number }>) {
  const currentLevel = getDotsLevelIndex(dots);
  const cappedDots = Math.max(0, Math.min(dots, 500));
  const markerSlot = Math.round((cappedDots / 500) * 99);
  const segmentBase = 'h-10 rounded-md transition-all duration-300';
  const segmentColors = [
    'bg-gradient-to-b from-[#2a0f45] to-[#3a1465]',
    'bg-gradient-to-b from-[#3f1561] to-[#5a1d83]',
    'bg-gradient-to-b from-[#5a1d83] to-[#7b2498]',
    'bg-gradient-to-b from-[#7b2498] to-[#a12f9f]',
    'bg-gradient-to-b from-[#a12f9f] to-[#c83f95]',
    'bg-gradient-to-b from-[#c83f95] to-[#ef645f]',
  ];

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-[#0b0e15] p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_20px_40px_rgba(0,0,0,0.45)]">
      <div className="mb-2 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Clasificacion</p>
          <p className="text-3xl font-black text-white">{getDotsLevel(dots)}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Puntuacion DOTS</p>
          <p className="text-3xl font-black text-white">{dots.toFixed(1)}</p>
        </div>
      </div>

      <div className="relative mt-3">
        <div className="grid grid-cols-[35fr_15fr_20fr_10fr_10fr_10fr] gap-1.5">
          {DOTS_LEVELS.map((level, i) => {
            const active = i === currentLevel;
            return (
              <div
                key={level.label}
                className={`${segmentBase} ${segmentColors[i]} ${active ? 'shadow-[0_0_18px_rgba(255,79,138,0.55)] ring-1 ring-white/30' : 'opacity-85'}`}
              />
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-0 grid grid-cols-100">
          {Array.from({ length: 100 }, (_, i) => (
            <div key={`marker-slot-${i}`} className="relative">
              {i === markerSlot && (
                <div className="absolute -top-2 left-1/2 h-14 w-0.5 -translate-x-1/2 rounded-full bg-white/95 shadow-[0_0_16px_rgba(255,255,255,0.95),0_0_24px_rgba(255,61,133,0.75)]" />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-[35fr_15fr_20fr_10fr_10fr_10fr] text-[11px] text-gray-400">
        <span className="text-right">175</span>
        <span className="text-right">250</span>
        <span className="text-right">350</span>
        <span className="text-right">400</span>
        <span className="text-right">450</span>
        <span className="text-right">500+</span>
      </div>

      <p className="mt-3 text-sm text-gray-300">
        Escala: Principiante, Intermedio, Avanzado, Elite, Internacional, World Class.
      </p>
    </div>
  );
}
