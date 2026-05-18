'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calculator } from 'lucide-react';
import { PlateCalculatorModal } from '@/components/plate-calculator-modal';

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
  exercise: {
    id: string;
    name: string;
  };
}

interface SessionWithSets {
  sets: Set[];
}

const extractExerciseSets = (sessions: SessionWithSets[], exerciseId: string): Set[] =>
  sessions
    .flatMap((session) => session.sets)
    .filter((set) => set.exercise.id === exerciseId);

export default function ExerciseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const date = params.date as string;
  const exerciseId = params.exerciseId as string;

  const [yearPart, monthPart, dayPart] = date.split('-').map(Number);
  const hasValidDateParts =
    Number.isInteger(yearPart) &&
    Number.isInteger(monthPart) &&
    Number.isInteger(dayPart) &&
    monthPart >= 1 &&
    monthPart <= 12 &&
    dayPart >= 1 &&
    dayPart <= 31;
  const displayDate = hasValidDateParts
    ? new Date(Date.UTC(yearPart, monthPart - 1, dayPart))
    : null;

  const [sets, setSets] = useState<Set[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCalculator, setShowCalculator] = useState(false);
  const [calculatorWeight, setCalculatorWeight] = useState(0);
  const [calculatorUnit, setCalculatorUnit] = useState<'kg' | 'lb'>('kg');
  const [exerciseOneRm, setExerciseOneRm] = useState<number | null>(null);
  const [exerciseLiftId, setExerciseLiftId] = useState<'SQ' | 'DL' | 'BP' | 'OHP' | null>(null);
  const [oneRmUnit, setOneRmUnit] = useState<'kg' | 'lb' | null>(null);

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
    const fetchExerciseSets = async () => {
      try {
        const res = await fetch(`/api/workouts/by-date/${date}`);
        if (!res.ok) throw new Error('Failed to fetch sessions');

        const data = await res.json();
        const filteredSets = extractExerciseSets(data.sessions as SessionWithSets[], exerciseId);

        setSets(filteredSets);

        const firstSet = filteredSets[0];
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

        await loadExerciseProfile(firstLiftId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchExerciseSets();
  }, [date, exerciseId]);

  const handleSetFeelingChange = async (setId: string, score: number) => {
    const set = sets.find((s) => s.id === setId);
    if (!set) return;

    try {
      const res = await fetch(
        `/api/workouts/${set.sessionId}/sets/${setId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ setFeelingScore: score }),
        }
      );

      if (!res.ok) throw new Error('Failed to update set');

      setSets(
        sets.map((s) =>
          s.id === setId ? { ...s, setFeelingScore: score } : s
        )
      );
    } catch (err) {
      console.error('Failed to update set feeling:', err);
    }
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

  const exerciseName = sets.length > 0 ? sets[0].exercise.name : 'Exercise';

  if (loading) {
    return (
      <main className="app-canvas min-h-full px-4 py-8">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="app-canvas min-h-full px-4 py-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="app-canvas min-h-full px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            title="Volver"
            aria-label="Volver"
            className="btn-dark p-2"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <div>
            <h1 className="text-4xl font-bold text-white">{exerciseName}</h1>
            <p className="text-gray-400">
              {displayDate
                ? displayDate.toLocaleDateString('es-ES', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    timeZone: 'UTC',
                  })
                : date}
            </p>
            {exerciseOneRm !== null && oneRmUnit && (
              <p className="text-sm text-gray-300 mt-1">
                1RM ({exerciseLiftId}): {exerciseOneRm} {oneRmUnit}
              </p>
            )}
          </div>
        </div>

        {/* Sets List */}
        <div className="space-y-4">
          {sets.map((set) => (
            <div
              key={set.id}
              className="panel space-y-4 p-4"
            >
              {/* Set Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Set {set.setNumber}
                  </h3>
                  <p className="text-gray-400">
                    {set.repsTarget} reps @ {set.targetWeight} {set.unit}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={set.isDone}
                    onChange={() => handleToggleDone(set.id, set.isDone)}
                    title={`Marcar set ${set.setNumber} como completado`}
                    aria-label={`Marcar set ${set.setNumber} como completado`}
                    className="w-6 h-6 rounded border-2 border-gray-600 checked:bg-[#d6ff43] checked:border-[#d6ff43] cursor-pointer"
                  />
                  <span className="text-sm text-gray-400">Done</span>
                </div>
              </div>

              {/* Feeling Slider */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Feeling: {set.setFeelingScore || '—'}
                </label>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-14">Muy cansado</span>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={set.setFeelingScore || 3}
                    onChange={(e) =>
                      handleSetFeelingChange(set.id, Number.parseInt(e.target.value, 10))
                    }
                    title={`Sensación del set ${set.setNumber}`}
                    aria-label={`Sensación del set ${set.setNumber}`}
                    className="flex-1 h-2 appearance-none rounded-lg bg-[#1f2630] accent-[#d6ff43] cursor-pointer"
                  />
                  <span className="text-xs text-gray-400 w-20">Lightweight 💪</span>
                </div>
              </div>

              {/* Plate Calculator Button */}
              <button
                onClick={() => handleOpenCalculator(Number(set.targetWeight), set.unit as 'kg' | 'lb')}
                className="btn-dark flex w-full items-center justify-center gap-2 px-4 py-2"
              >
                <Calculator size={18} />
                Calcular Pesos
              </button>
            </div>
          ))}
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
