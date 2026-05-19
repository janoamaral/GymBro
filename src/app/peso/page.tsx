'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Scale } from 'lucide-react';

type WeightUnit = 'kg' | 'lb';

type BodyweightMeasurement = {
  id: string;
  weight: number;
  unit: WeightUnit;
  measuredAt: string;
};

export default function PesoPage() {
  const router = useRouter();
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [measurements, setMeasurements] = useState<BodyweightMeasurement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latest = measurements[0] ?? null;

  const latestText = useMemo(() => {
    if (!latest) {
      return 'Sin mediciones aún';
    }

    const date = new Date(latest.measuredAt).toLocaleDateString('es-AR');
    return `${latest.weight.toFixed(1)} ${latest.unit} - ${date}`;
  }, [latest]);

  let historyContent: ReactNode;

  if (loading) {
    historyContent = <p className="mt-4 text-gray-400">Cargando mediciones...</p>;
  } else if (measurements.length === 0) {
    historyContent = <p className="mt-4 text-gray-400">Todavía no registraste peso.</p>;
  } else {
    historyContent = (
      <div className="mt-4 space-y-2">
        {measurements.map((measurement) => (
          <div key={measurement.id} className="panel-soft flex items-center justify-between rounded-xl px-4 py-3">
            <span className="text-lg font-semibold text-white">
              {measurement.weight.toFixed(1)} {measurement.unit}
            </span>
            <span className="text-sm text-gray-300">
              {new Date(measurement.measuredAt).toLocaleDateString('es-AR')}
            </span>
          </div>
        ))}
      </div>
    );
  }

  async function loadMeasurements() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/user/bodyweight');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? 'FAILED_TO_LOAD_BODYWEIGHT');
      }

      setMeasurements((data.measurements ?? []) as BodyweightMeasurement[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'FAILED_TO_LOAD_BODYWEIGHT');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      loadMeasurements();
    }, 0);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedWeight = Number(weight);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setError('El peso debe ser mayor a 0');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/user/bodyweight', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weight: parsedWeight,
          unit,
          measuredAt: new Date(`${measuredAt}T12:00:00.000Z`).toISOString(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? 'FAILED_TO_SAVE_BODYWEIGHT');
      }

      setWeight('');
      await loadMeasurements();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'FAILED_TO_SAVE_BODYWEIGHT');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="mb-2 flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            title="Volver"
            aria-label="Volver"
            className="btn-dark p-2"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Sección</p>
            <h1 className="text-4xl font-bold text-white">Peso</h1>
          </div>
        </div>

        <section className="panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Última medición</p>
              <p className="mt-1 text-2xl font-bold text-[#d6ff43]">{latestText}</p>
            </div>
            <div className="rounded-full border border-[#d6ff43]/30 bg-[#d6ff43]/10 p-3 text-[#d6ff43]">
              <Scale size={20} />
            </div>
          </div>
        </section>

        <section className="panel p-5 sm:p-6">
          <h2 className="text-xl font-bold text-white">Registrar peso</h2>
          <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 sm:col-span-1">
              <span className="text-xs uppercase tracking-[0.18em] text-gray-400">Peso</span>
              <input
                className="field-dark"
                type="number"
                min="1"
                step="0.1"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                required
              />
            </label>

            <label className="flex flex-col gap-1 sm:col-span-1">
              <span className="text-xs uppercase tracking-[0.18em] text-gray-400">Unidad</span>
              <select className="field-dark" value={unit} onChange={(event) => setUnit(event.target.value as WeightUnit)}>
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </select>
            </label>

            <label className="flex flex-col gap-1 sm:col-span-1">
              <span className="text-xs uppercase tracking-[0.18em] text-gray-400">Fecha</span>
              <input
                className="field-dark"
                type="date"
                value={measuredAt}
                onChange={(event) => setMeasuredAt(event.target.value)}
                required
              />
            </label>

            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="btn-accent px-4 py-2 font-semibold disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar medición'}
              </button>
            </div>
          </form>

          {error && (
            <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
        </section>

        <section className="panel p-5 sm:p-6">
          <h2 className="text-xl font-bold text-white">Historial reciente</h2>
          {historyContent}
        </section>
      </div>
    </main>
  );
}
