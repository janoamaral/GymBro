export type LiftMarker = 'BP' | 'DL' | 'SQ';

export const LIFT_THEME: Record<LiftMarker, { card: string; badge: string; accent: string; name: string }> = {
  BP: {
    card: 'border border-emerald-300/40 bg-gradient-to-br from-emerald-400/18 via-[#11161d] to-[#0e1319]',
    badge: 'border-emerald-300/45 bg-emerald-300/15 text-emerald-100',
    accent: 'text-emerald-200',
    name: 'Bench Press',
  },
  DL: {
    card: 'border border-violet-300/40 bg-gradient-to-br from-violet-400/18 via-[#11161d] to-[#0e1319]',
    badge: 'border-violet-300/45 bg-violet-300/15 text-violet-100',
    accent: 'text-violet-200',
    name: 'Deadlift',
  },
  SQ: {
    card: 'border border-orange-300/40 bg-gradient-to-br from-orange-400/18 via-[#11161d] to-[#0e1319]',
    badge: 'border-orange-300/45 bg-orange-300/15 text-orange-100',
    accent: 'text-orange-200',
    name: 'Squat',
  },
};

export function isLiftMarker(value: string | null | undefined): value is LiftMarker {
  return value === 'BP' || value === 'DL' || value === 'SQ';
}