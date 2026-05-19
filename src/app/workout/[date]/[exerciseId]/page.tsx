'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calculator, Dumbbell } from 'lucide-react';
import { PlateCalculatorModal } from '@/components/plate-calculator-modal';
import { Skeleton } from '@/components/ui/skeleton';

const SHARED_EXERCISE_TITLE_KEY = 'shared-exercise-title-transition';

interface Set {
  id: string;
  sessionId: string;
  liftId: 'SQ' | 'DL' | 'BP' | 'OHP' | null;
  setNumber: number;
  repsTarget: number;
  targetWeight: number;
  unit: string;
  isDone: boolean;
  setFeelingScore: number | null;
  rpe: number | null;
  rir: number | null;
  exercise: {
    id: string;
    name: string;
  };
}

interface SessionWithSets {
  sets: Set[];
}

const WORKOUT_CACHE_KEY = 'workout-by-date-cache';

const getCachedExerciseSets = (date: string, exerciseId: string): Set[] => {
  if (globalThis.window === undefined) {
    return [];
  }

  try {
    const cacheRaw = localStorage.getItem(WORKOUT_CACHE_KEY);
    if (!cacheRaw) {
      return [];
    }

    const cache = JSON.parse(cacheRaw) as Record<string, SessionWithSets[]>;
    const sessions = cache[date] ?? [];
    return extractExerciseSets(sessions, exerciseId);
  } catch {
    return [];
  }
};

const extractExerciseSets = (sessions: SessionWithSets[], exerciseId: string): Set[] =>
  sessions
    .flatMap((session) => session.sets)
    .filter((set) => set.exercise.id === exerciseId);

export default function ExerciseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const date = params.date as string;
  const exerciseId = params.exerciseId as string;

  const [sets, setSets] = useState<Set[]>(() => getCachedExerciseSets(date, exerciseId));
  const [loading, setLoading] = useState(() => getCachedExerciseSets(date, exerciseId).length === 0);
  const [error, setError] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorWeight, setCalculatorWeight] = useState(0);
  const [calculatorUnit, setCalculatorUnit] = useState<'kg' | 'lb'>('kg');
  const [exerciseOneRm, setExerciseOneRm] = useState<number | null>(null);
  const [exerciseLiftId, setExerciseLiftId] = useState<'SQ' | 'DL' | 'BP' | 'OHP' | null>(null);
  const [oneRmUnit, setOneRmUnit] = useState<'kg' | 'lb' | null>(null);
  const [isTitleEntering, setIsTitleEntering] = useState(false);
  const [isMetaEntering, setIsMetaEntering] = useState(false);
  const [entryTitle, setEntryTitle] = useState<string | null>(null);
  const [entrySetCountText, setEntrySetCountText] = useState<string | null>(null);

  const clearExerciseProfile = () => {
    setExerciseOneRm(null);
    setOneRmUnit(null);
  };

  const loadExerciseProfile = async (lift: 'SQ' | 'DL' | 'BP' | 'OHP') => {
    const profileRes = await fetch('/api/training/531/profile');
    if (!profileRes.ok) {
      clearExerciseProfile();
      return;
    }

    const profileData = await profileRes.json();
    const profile = (profileData.profiles ?? []).find(
      (item: { liftId: string }) => item.liftId === lift
    );

    if (!profile) {
      clearExerciseProfile();
      return;
    }

    setExerciseOneRm(Number(profile.oneRm));
    setOneRmUnit(profile.unit as 'kg' | 'lb');
  };

  useEffect(() => {
    setError('');

    const cachedSets = getCachedExerciseSets(date, exerciseId);
    const hasCachedSets = cachedSets.length > 0;

    if (hasCachedSets) {
      setSets(cachedSets);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const hydrateProfileFromSets = (sourceSets: Set[]) => {
      const firstSet = sourceSets[0];
      if (!firstSet) {
        setExerciseLiftId(null);
        clearExerciseProfile();
        return;
      }

      setCalculatorUnit(firstSet.unit as 'kg' | 'lb');
      const firstLiftId = firstSet.liftId;
      setExerciseLiftId(firstLiftId);

      if (!firstLiftId) {
        clearExerciseProfile();
        return;
      }

      loadExerciseProfile(firstLiftId);
    };

    if (hasCachedSets) {
      hydrateProfileFromSets(cachedSets);
    }

    // Fetch en background y actualiza si hay cambios
    const fetchExerciseSets = async () => {
      try {
        const res = await fetch(`/api/workouts/by-date/${date}`);
        if (!res.ok) throw new Error('Failed to fetch sessions');

        const data = await res.json();
        const filteredSets = extractExerciseSets(data.sessions as SessionWithSets[], exerciseId);

        setSets(filteredSets);

        // Actualiza cache
        try {
          const cacheRaw = localStorage.getItem(WORKOUT_CACHE_KEY);
          const cache = cacheRaw ? JSON.parse(cacheRaw) : {};
          cache[date] = data.sessions;
          localStorage.setItem(WORKOUT_CACHE_KEY, JSON.stringify(cache));
        } catch {}

        hydrateProfileFromSets(filteredSets);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchExerciseSets();
  }, [date, exerciseId]);

  useEffect(() => {
    if (loading) {
      return;
    }

    try {
      const rawTransitionData = sessionStorage.getItem(SHARED_EXERCISE_TITLE_KEY);
      if (!rawTransitionData) {
        setIsTitleEntering(false);
        setIsMetaEntering(false);
        return;
      }

      sessionStorage.removeItem(SHARED_EXERCISE_TITLE_KEY);
      const transitionData = JSON.parse(rawTransitionData) as {
        date: string;
        exerciseId: string;
        title: string;
        setCountText?: string;
      };

      if (transitionData.date !== date || transitionData.exerciseId !== exerciseId) {
        return;
      }

      setEntryTitle(transitionData.title);
      setEntrySetCountText(transitionData.setCountText ?? null);
      setIsTitleEntering(true);
      setIsMetaEntering(true);

      const timeoutId = globalThis.window.setTimeout(() => {
        setIsTitleEntering(false);
        setIsMetaEntering(false);
      }, 260);

      return () => {
        globalThis.window.clearTimeout(timeoutId);
        setIsTitleEntering(false);
        setIsMetaEntering(false);
      };
    } catch {
      // Ignora errores de parseo para no romper la navegacion.
      setIsTitleEntering(false);
      setIsMetaEntering(false);
    }
  }, [loading, date, exerciseId]);

  const updateSetMetrics = async (setId: string, updates: Partial<Pick<Set, 'setFeelingScore' | 'rpe' | 'rir'>>) => {
    const set = sets.find((s) => s.id === setId);
    if (!set) return;

    try {
      const res = await fetch(`/api/workouts/${set.sessionId}/sets/${setId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update set');

      setSets(
        sets.map((s) =>
          s.id === setId ? { ...s, ...updates } : s
        )
      );
    } catch (err) {
      console.error('Failed to update set metrics:', err);
    }
  };

  const handleSetFeelingChange = async (setId: string, score: number) => {
    await updateSetMetrics(setId, { setFeelingScore: score });
  };

  const handleRpeChange = async (setId: string, rpe: number) => {
    await updateSetMetrics(setId, { rpe });
  };

  const handleRirChange = async (setId: string, rir: number) => {
    await updateSetMetrics(setId, { rir });
  };

  const handleToggleDone = async (setId: string, isDone: boolean) => {
    const set = sets.find((s) => s.id === setId);
    if (!set) return;

    try {
      const res = await fetch(
        `/api/workouts/${set.sessionId}/sets/${setId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDone: !isDone }),
        }
      );

      if (!res.ok) throw new Error('Failed to update set');

      setSets(
        sets.map((s) =>
          s.id === setId ? { ...s, isDone: !isDone } : s
        )
      );
    } catch (err) {
      console.error('Failed to toggle set done:', err);
    }
  };

  const handleOpenCalculator = (weight: number, unit: 'kg' | 'lb') => {
    setCalculatorWeight(weight);
    setCalculatorUnit(unit);
    setShowCalculator(true);
  };

  const renderFeelingSection = (set: Set, isNext: boolean) => {
    if (!set.isDone) {
      return (
        <p className={isNext ? 'mb-2 text-xs font-semibold text-[#101010]/80' : 'mb-2 text-xs text-gray-400'}>
          Marca este set como completado para registrar feeling, RPE y RIR.
        </p>
      );
    }

    return (
      <div className="mb-2 space-y-4">
        <div>
          <label className={isNext ? 'block text-xs font-bold text-[#101010] mb-1' : 'block text-xs font-medium text-gray-300 mb-1'}>
            Feeling: {set.setFeelingScore ?? '—'}
          </label>
          <div className="flex items-center gap-3">
            <span className={isNext ? 'text-xs text-[#101010] w-14' : 'text-xs text-gray-400 w-14'}>Muy cansado</span>
            <input
              type="range"
              min="1"
              max="5"
              value={set.setFeelingScore ?? 3}
              onChange={(e) =>
                handleSetFeelingChange(set.id, Number.parseInt(e.target.value, 10))
              }
              title={`Sensación del set ${set.setNumber}`}
              aria-label={`Sensación del set ${set.setNumber}`}
              className={isNext ? 'flex-1 h-2 appearance-none rounded-lg bg-[#eaffb0] accent-[#101010] cursor-pointer' : 'flex-1 h-2 appearance-none rounded-lg bg-[#1f2630] accent-[#d6ff43] cursor-pointer'}
            />
            <span className={isNext ? 'text-xs text-[#101010] w-20' : 'text-xs text-gray-400 w-20'}>Lightweight 💪</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-2">
            <span className={isNext ? 'text-xs font-bold text-[#101010]' : 'text-xs font-medium text-gray-300'}>
              RPE: {set.rpe ?? '—'}
            </span>
            <input
              type="range"
              min="1"
              max="10"
              value={set.rpe ?? 6}
              onChange={(e) => handleRpeChange(set.id, Number.parseInt(e.target.value, 10))}
              title={`RPE del set ${set.setNumber}`}
              aria-label={`RPE del set ${set.setNumber}`}
              className={isNext ? 'h-2 appearance-none rounded-lg bg-[#eaffb0] accent-[#101010] cursor-pointer' : 'h-2 appearance-none rounded-lg bg-[#1f2630] accent-[#d6ff43] cursor-pointer'}
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className={isNext ? 'text-xs font-bold text-[#101010]' : 'text-xs font-medium text-gray-300'}>
              RIR: {set.rir ?? '—'}
            </span>
            <input
              type="range"
              min="0"
              max="10"
              value={set.rir ?? 2}
              onChange={(e) => handleRirChange(set.id, Number.parseInt(e.target.value, 10))}
              title={`RIR del set ${set.setNumber}`}
              aria-label={`RIR del set ${set.setNumber}`}
              className={isNext ? 'h-2 appearance-none rounded-lg bg-[#eaffb0] accent-[#101010] cursor-pointer' : 'h-2 appearance-none rounded-lg bg-[#1f2630] accent-[#d6ff43] cursor-pointer'}
            />
          </label>
        </div>
      </div>
    );
  };

  const exerciseName = sets.length > 0 ? sets[0].exercise.name : entryTitle ?? 'Ejercicio';
  const setCountText = `${sets.length} serie${sets.length > 1 ? 's' : ''}`;
  const headerSetCountText = entrySetCountText ?? setCountText;


  if (loading) {
    // Si no hay sets aún, muestra 3 skeletons por defecto
    const skeletonCount = sets.length > 0 ? sets.length : 3;
    return (
      <main className="app-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="mb-10 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-neutral-800 animate-pulse" />
            <div className="flex-1">
              <Skeleton className="h-10 w-40 mb-2" />
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex flex-col gap-6">
            {Array.from({ length: skeletonCount }, (_, n) => `skeleton-${n + 1}`).map((skeletonId) => (
              <div key={skeletonId} className="panel-soft p-6 min-h-30 flex flex-col gap-4">
                <Skeleton className="h-6 w-24 mb-2" />
                <Skeleton className="h-8 w-32 mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-canvas min-h-screen px-4 py-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  // Encuentra el primer set no completado (próximo a realizar)
  const nextSetIndex = sets.findIndex((set) => !set.isDone);

  return (
    <main className="app-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        {/* Header tipo portada */}
        <div className="relative mb-10 pl-14">
          <button
            onClick={() => router.back()}
            title="Volver"
            aria-label="Volver"
            className="btn-dark absolute left-0 top-1 h-10 w-10 p-2"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div>
            <h1
              className={`text-4xl sm:text-5xl font-heading font-black leading-tight text-white drop-shadow-md uppercase transition-all duration-300 ease-out ${isTitleEntering ? 'translate-y-10 scale-90 opacity-50' : 'translate-y-0 scale-100 opacity-100'}`}
            >
              {exerciseName}
            </h1>
            <p
              className={`mt-1 text-xs font-heading uppercase tracking-[0.2em] text-gray-300 transition-all duration-300 ease-out ${isMetaEntering ? 'translate-y-8 scale-95 opacity-40' : 'translate-y-0 scale-100 opacity-100'}`}
            >
              {headerSetCountText}
            </p>
            {exerciseOneRm !== null && oneRmUnit && (
              <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-[#d6ff43]/45 bg-[#d6ff43]/10 px-2.5 py-1.5 text-[#e8f8b0]">
                <Dumbbell size={14} className="text-[#d6ff43]" />
                <p className="text-xs font-semibold uppercase tracking-[0.14em]">
                  1RM {exerciseLiftId ? `(${exerciseLiftId})` : ''}: {exerciseOneRm} {oneRmUnit}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Lista de sets tipo tarjetas */}
        <div className="flex flex-col gap-6">
          {sets.map((set, idx) => {
            const isNext = idx === nextSetIndex;
            return (
              <div
                key={set.id}
                className={
                  isNext
                    ? 'relative rounded-2xl bg-accent text-[#101010] shadow-lg p-6 transition-all min-h-30'
                    : 'panel-soft p-6 text-white min-h-30'
                }
              >
                {/* Info principal */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="block text-xs font-heading uppercase tracking-widest opacity-70">
                      Serie {set.setNumber}
                    </span>
                    <span className={isNext ? 'text-3xl font-black font-heading' : 'text-2xl font-bold font-heading'}>
                      {set.repsTarget} reps @ {set.targetWeight} {set.unit}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <input
                      type="checkbox"
                      checked={set.isDone}
                      onChange={() => handleToggleDone(set.id, set.isDone)}
                      title={`Marcar set ${set.setNumber} como completado`}
                      aria-label={`Marcar set ${set.setNumber} como completado`}
                      className={
                        isNext
                          ? 'w-7 h-7 rounded border-2 border-[#b6d900] checked:bg-[#101010] checked:border-[#101010] accent-[#101010] cursor-pointer'
                          : 'w-6 h-6 rounded border-2 border-gray-600 checked:bg-[#d6ff43] checked:border-[#d6ff43] cursor-pointer'
                      }
                    />
                    <span className={isNext ? 'text-xs text-[#101010] font-bold' : 'text-xs text-gray-400'}>
                      {set.isDone ? 'Completado' : 'Pendiente'}
                    </span>
                  </div>
                </div>

                {/* Feeling: solo despues de completar el set */}
                {renderFeelingSection(set, isNext)}

                {set.isDone && (
                  <div className={isNext ? 'mt-2 flex flex-wrap gap-2 text-xs font-semibold text-[#101010]' : 'mt-2 flex flex-wrap gap-2 text-xs font-semibold text-gray-300'}>
                    <span className={isNext ? 'rounded-full bg-[#101010]/10 px-2 py-1' : 'rounded-full bg-white/5 px-2 py-1'}>RPE {set.rpe ?? '—'}</span>
                    <span className={isNext ? 'rounded-full bg-[#101010]/10 px-2 py-1' : 'rounded-full bg-white/5 px-2 py-1'}>RIR {set.rir ?? '—'}</span>
                  </div>
                )}

                {/* Botón de calcular pesos */}
                <button
                  onClick={() => handleOpenCalculator(Number(set.targetWeight), set.unit as 'kg' | 'lb')}
                  className={
                    isNext
                      ? 'btn-dark flex w-full items-center justify-center gap-2 px-4 py-2 bg-[#101010] text-accent border-none font-bold mt-2'
                      : 'btn-dark flex w-full items-center justify-center gap-2 px-4 py-2 mt-2'
                  }
                >
                  <Calculator size={18} />
                  Calcular Pesos
                </button>
              </div>
            );
          })}
        </div>

        {sets.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400">No sets for this exercise</p>
          </div>
        )}
      </div>

      {/* Plate Calculator Modal */}
      <PlateCalculatorModal
        isOpen={showCalculator}
        onClose={() => setShowCalculator(false)}
        targetWeight={calculatorWeight}
        unit={calculatorUnit}
      />
    </main>
  );
}
