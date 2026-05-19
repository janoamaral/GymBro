'use client';

import { useMemo, useState } from 'react';
import { calculateMeetCoefficients, type MeetSex } from '@/lib/training/meet-coefficients';
import type { WeightUnit } from '@/lib/units/conversion';

const COEFFICIENTS = [
  { key: 'wilks', label: 'Wilks' },
  { key: 'wilks2020', label: 'Wilks 2' },
  { key: 'dots', label: 'DOTS' },
] as const;

// Datos estáticos simulando los valores del plan/usuario
const STATIC_DATA = {
  squat: 220,
  bench: 150,
  deadlift: 260,
  bodyweight: 93,
  sex: 'male' as MeetSex,
  unit: 'kg' as WeightUnit,
};

export function MeetCoefficientsCard() {
  // Los datos de entrada quedan ocultos en el acordeón
  const [showDetails, setShowDetails] = useState(false);
  const { squat, bench, deadlift, bodyweight, sex, unit } = STATIC_DATA;

  const result = useMemo(() => {
    try {
      return calculateMeetCoefficients({ squat, bench, deadlift, bodyweight, sex, unit });
    } catch {
      return null;
    }
  }, [squat, bench, deadlift, bodyweight, sex, unit]);

  return (
    <section className="panel p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Meet day tools</p>
          <h2 className="mt-1 text-xl font-bold text-white">Total y coeficientes</h2>
          <p className="mt-1 text-sm text-gray-400">Calcula total y puntos relativos con base en tu configuración actual.</p>
        </div>
        <div className="rounded-full border border-[#d6ff43]/30 bg-[#d6ff43]/10 px-3 py-1 text-xs font-semibold text-[#e8f8b0]">
          Classic
        </div>
      </div>

      {/* Cards de puntos y total */}
      {result && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-white/8 bg-white/4 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Total</p>
            <p className="mt-2 text-3xl font-black text-white">{result.total}</p>
            <p className="text-sm text-gray-400">{unit}</p>
          </div>
          {COEFFICIENTS.map((coefficient) => (
            <div key={coefficient.key} className="rounded-2xl border border-white/8 bg-white/4 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400">{coefficient.label}</p>
              <p className="mt-2 text-3xl font-black text-[#e8f8b0]">{result[coefficient.key]}</p>
              <p className="text-sm text-gray-400">score</p>
            </div>
          ))}
        </div>
      )}

      {/* Acordeón para mostrar detalles de configuración (oculto por defecto) */}
      <div className="mt-6">
        <button
          className="text-xs text-gray-400 underline"
          onClick={() => setShowDetails((v) => !v)}
        >
          {showDetails ? 'Ocultar detalles' : 'Mostrar detalles de configuración'}
        </button>
        {showDetails && (
          <div className="mt-3 rounded-xl bg-white/5 p-4 text-sm text-gray-300">
            <div>Squat 1RM: <b>{squat} {unit}</b></div>
            <div>Bench 1RM: <b>{bench} {unit}</b></div>
            <div>Deadlift 1RM: <b>{deadlift} {unit}</b></div>
            <div>Peso corporal: <b>{bodyweight} {unit}</b></div>
            <div>Sexo: <b>{sex === 'male' ? 'Masculino' : 'Femenino'}</b></div>
            <div>Unidad: <b>{unit}</b></div>
          </div>
        )}
      </div>

      <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/3 px-4 py-3 text-sm text-gray-400">
        IPF GL entra en el siguiente slice de implementación. La base para total y coeficientes relativos ya quedó lista.
      </div>
    </section>
  );
}