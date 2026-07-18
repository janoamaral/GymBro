'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Scale } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';

type WeightUnit = 'kg' | 'lb';

type BodyweightMeasurement = {
  id: string;
  weight: number;
  unit: WeightUnit;
  measuredAt: string;
};

type BodyweightChartPoint = {
  id: string;
  date: string;
  weight: number;
};

type RangeKey = 'week' | 'month' | 'max';

const RANGE_DAYS: Record<Exclude<RangeKey, 'max'>, number> = {
  week: 7,
  month: 30,
};

function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
  if (from === to) {
    return value;
  }

  if (from === 'kg' && to === 'lb') {
    return value * 2.2046226218;
  }

  return value / 2.2046226218;
}

export default function PesoPage() {
  const router = useRouter();
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('kg');
  const [measuredAt, setMeasuredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [measurements, setMeasurements] = useState<BodyweightMeasurement[]>([]);
  const [range, setRange] = useState<RangeKey>('max');
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

  const normalizedPoints = useMemo<{ points: BodyweightChartPoint[]; unit: WeightUnit }>(() => {
    if (measurements.length === 0) {
      return { points: [], unit: 'kg' };
    }

    const sorted = measurements
      .slice()
      .sort((a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime());

    const unitForChart = latest?.unit ?? sorted.at(-1)?.unit ?? 'kg';

    const points = sorted.map((measurement) => ({
      id: measurement.id,
      date: measurement.measuredAt,
      weight: Number(convertWeight(measurement.weight, measurement.unit, unitForChart).toFixed(2)),
    }));

    return {
      points,
      unit: unitForChart,
    };
  }, [measurements, latest]);

  const chartPoints = useMemo(() => {
    if (range === 'max' || normalizedPoints.points.length === 0) {
      return normalizedPoints.points;
    }

    const lastPoint = normalizedPoints.points.at(-1);
    if (!lastPoint) {
      return normalizedPoints.points;
    }

    const endTimestamp = new Date(lastPoint.date).getTime();
    const cutoff = endTimestamp - RANGE_DAYS[range] * 24 * 60 * 60 * 1000;

    return normalizedPoints.points.filter((point) => new Date(point.date).getTime() >= cutoff);
  }, [normalizedPoints.points, range]);

  const firstPoint = chartPoints[0] ?? null;
  const lastPoint = chartPoints.at(-1) ?? null;
  const trend =
    firstPoint && lastPoint && firstPoint.weight > 0
      ? ((lastPoint.weight - firstPoint.weight) / firstPoint.weight) * 100
      : 0;
  const trendPrefix = trend >= 0 ? '+' : '';
  const trendLabel = Number.isFinite(trend) ? `${trendPrefix}${trend.toFixed(1)}%` : '0.0%';

  const formatXAxis = (date: string) => {
    const parsed = new Date(date);

    if (range === 'max') {
      return parsed.toLocaleDateString('es-ES', { year: '2-digit', month: '2-digit' });
    }

    return parsed.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  };

  let chartContent: ReactNode;

  if (loading) {
    chartContent = (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/8 bg-black/20">
        <p className="text-sm text-gray-400">Cargando evolución...</p>
      </div>
    );
  } else if (chartPoints.length === 0) {
    chartContent = (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/8 bg-black/20">
        <p className="text-sm text-gray-400">No hay mediciones para este rango.</p>
      </div>
    );
  } else {
    chartContent = (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartPoints}
          margin={{ top: 10, right: 8, left: -14, bottom: 0 }}
          accessibilityLayer={false}
          tabIndex={-1}
        >
          <defs>
            <linearGradient id="bodyweightStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4ef2bf" />
              <stop offset="100%" stopColor="#2de18d" />
            </linearGradient>
            <linearGradient id="bodyweightFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16c784" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#16c784" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="2 8" vertical stroke="rgba(255,255,255,0.12)" horizontal={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            tick={{ fill: '#8ca0af', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={26}
          />
          <YAxis
            tick={{ fill: '#8ca0af', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            formatter={(value) => {
              const numericValue = typeof value === 'number' ? value : Number(value);
              const formattedValue = Number.isFinite(numericValue)
                ? `${numericValue.toFixed(1)} ${normalizedPoints.unit}`
                : String(value);

              return [formattedValue, 'Peso'];
            }}
            labelFormatter={(label) => {
              if (typeof label !== 'string' && typeof label !== 'number') {
                return '';
              }

              return new Date(String(label)).toLocaleDateString('es-ES', {
                year: 'numeric',
                month: 'short',
                day: '2-digit',
              });
            }}
            contentStyle={{
              backgroundColor: '#0a1215',
              border: '1px solid rgba(46, 224, 147, 0.45)',
              borderRadius: '0.75rem',
              color: '#e4fff3',
            }}
            labelStyle={{ color: '#d3fce8' }}
          />
          <Area
            type="monotone"
            dataKey="weight"
            stroke="url(#bodyweightStroke)"
            fill="url(#bodyweightFill)"
            strokeWidth={3}
            dot={false}
            activeDot={{ r: 5, fill: '#0e3225', stroke: '#5cf2be', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

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
      const data = await fetchJsonWithInFlightDedup<{ measurements?: BodyweightMeasurement[] }>('/api/user/bodyweight');

      setMeasurements(data.measurements ?? []);
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

        <section className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#05090c] p-5 text-white shadow-[0_12px_42px_rgba(0,0,0,0.45)] sm:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_100%,rgba(16,185,129,0.35),transparent_40%)]" />

          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">Chart</h2>
                <p className="mt-1 text-xs text-gray-400">Evolución de peso corporal</p>
              </div>
            </div>

            <div className="mt-5 rounded-full border border-white/10 bg-black/25 p-1">
              <div className="grid grid-cols-3 gap-1 text-sm">
                {([
                  { key: 'week', label: 'Week' },
                  { key: 'month', label: 'Month' },
                  { key: 'max', label: 'Max' },
                ] as { key: RangeKey; label: string }[]).map((rangeOption) => (
                  <button
                    key={rangeOption.key}
                    type="button"
                    onClick={() => setRange(rangeOption.key)}
                    className={`rounded-full px-3 py-2 transition-colors ${
                      rangeOption.key === range
                        ? 'bg-white/16 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]'
                        : 'text-gray-400 hover:text-gray-200'
                    } focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0`}
                  >
                    {rangeOption.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 h-64 sm:h-72">
              {chartContent}
            </div>

            <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-gray-400">Peso actual</p>
                <p className="text-4xl font-semibold leading-none">
                  {lastPoint ? lastPoint.weight.toFixed(1) : '--'}
                  <span className="ml-1 text-base text-gray-300">{normalizedPoints.unit}</span>
                </p>
              </div>

              <div className={`text-right text-3xl font-semibold ${trend >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                <p>{trend >= 0 ? '↗' : '↘'} {trendLabel}</p>
                <p className="mt-1 text-xs font-normal uppercase tracking-[0.16em] text-gray-400">Desde inicio del rango</p>
              </div>
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
