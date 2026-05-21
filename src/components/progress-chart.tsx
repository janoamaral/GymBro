'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';

interface ProgressPoint {
  id: string;
  date: string;
  e1rm: number;
  unit: 'kg' | 'lb';
}

type LiftId = 'BP' | 'SQ' | 'DL';
type RangeKey = 'week' | 'month' | 'max';

const RANGE_DAYS: Record<Exclude<RangeKey, 'max'>, number> = {
  week: 7,
  month: 30,
};

const LIFT_LABELS: Record<LiftId, string> = {
  BP: 'Bench Press',
  SQ: 'Squat',
  DL: 'Deadlift',
};

export function ProgressChart() {
  const [liftId, setLiftId] = useState<LiftId>('BP');
  const [range, setRange] = useState<RangeKey>('max');
  const [points, setPoints] = useState<ProgressPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      try {
        const payload = await fetchJsonWithInFlightDedup<{ points?: ProgressPoint[] }>(
          `/api/training/531/progress?liftId=${liftId}`
        );

        const nextPoints = Array.isArray(payload.points)
          ? payload.points
              .slice()
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          : [];

        setPoints(nextPoints);
      } catch (error) {
        console.error('Failed to fetch progress data:', error);
        setPoints([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [liftId]);

  const filteredPoints = useMemo(() => {
    if (range === 'max') {
      return points;
    }

    const days = RANGE_DAYS[range];
    const latestPointTs = points.at(-1) ? new Date(points.at(-1)!.date).getTime() : null;
    const cutoff = latestPointTs === null ? Number.NEGATIVE_INFINITY : latestPointTs - days * 24 * 60 * 60 * 1000;

    return points.filter((point) => new Date(point.date).getTime() >= cutoff);
  }, [points, range]);

  const firstPoint = filteredPoints[0] ?? null;
  const lastPoint = filteredPoints.at(-1) ?? null;
  const unit = lastPoint?.unit ?? points.at(-1)?.unit ?? '';

  const trend =
    firstPoint && lastPoint && firstPoint.e1rm > 0
      ? ((lastPoint.e1rm - firstPoint.e1rm) / firstPoint.e1rm) * 100
      : 0;

  const trendPrefix = trend >= 0 ? '+' : '';
  const trendLabel = Number.isFinite(trend) ? `${trendPrefix}${trend.toFixed(1)}%` : '0.0%';

  let rangeLabel = 'All Time';
  if (range === 'week') {
    rangeLabel = '7 Days';
  } else if (range === 'month') {
    rangeLabel = '30 Days';
  }

  const formatXAxis = (date: string) => {
    const parsed = new Date(date);

    if (range === 'max') {
      return parsed.toLocaleDateString('es-ES', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
      });
    }

    return parsed.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
  };

  const isEmpty = !loading && filteredPoints.length === 0;

  if (loading) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#05090c] p-5 sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_100%,rgba(16,185,129,0.35),transparent_40%)]" />
        <div className="relative flex h-64 items-center justify-center">
          <p className="text-sm text-gray-400">Cargando progreso...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#05090c] p-5 text-white shadow-[0_12px_42px_rgba(0,0,0,0.45)] sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_100%,rgba(16,185,129,0.35),transparent_40%)]" />

      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold normal-case not-italic">Chart</h3>
            <p className="mt-1 text-xs text-gray-400">Top keyword</p>
            <p className="text-lg font-semibold normal-case not-italic">{LIFT_LABELS[liftId]}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {(['BP', 'SQ', 'DL'] as LiftId[]).map((currentLift) => (
              <button
                key={currentLift}
                type="button"
                onClick={() => setLiftId(currentLift)}
                className={`rounded-lg border px-2 py-1 text-center transition-colors ${
                  currentLift === liftId
                    ? 'border-emerald-300/60 bg-emerald-400/20 text-emerald-200'
                    : 'border-white/10 bg-black/20 text-gray-300 hover:border-white/25'
                } focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0`}
              >
                {currentLift}
              </button>
            ))}
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
          {isEmpty ? (
            <div className="flex h-full items-center justify-center rounded-2xl border border-white/8 bg-black/20">
              <p className="text-sm text-gray-400">No hay datos de progreso para este rango.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={filteredPoints}
                margin={{ top: 10, right: 8, left: -14, bottom: 0 }}
                accessibilityLayer={false}
                tabIndex={-1}
              >
                <defs>
                  <linearGradient id="progressStroke" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#4ef2bf" />
                    <stop offset="100%" stopColor="#2de18d" />
                  </linearGradient>
                  <linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1">
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
                      ? `${numericValue.toFixed(1)} ${unit}`
                      : String(value);

                    return [formattedValue, 'e1RM'];
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
                  dataKey="e1rm"
                  stroke="url(#progressStroke)"
                  fill="url(#progressFill)"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 5, fill: '#0e3225', stroke: '#5cf2be', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between gap-4 border-t border-white/10 pt-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-gray-400">{rangeLabel}</p>
            <p className="text-4xl font-semibold leading-none normal-case not-italic">
              {lastPoint ? lastPoint.e1rm.toFixed(1) : '--'}
              <span className="ml-1 text-base text-gray-300">{unit}</span>
            </p>
          </div>

          <div className={`text-right text-3xl font-semibold normal-case not-italic ${trend >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            <p>{trend >= 0 ? '↗' : '↘'} {trendLabel}</p>
            <p className="mt-1 text-xs font-normal uppercase tracking-[0.16em] text-gray-400">Desde inicio del rango</p>
          </div>
        </div>
      </div>
    </div>
  );
}
