'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExerciseFormModal, Exercise } from '@/components/plan-wizard/exercise-form-modal';
import { ExerciseList } from '@/components/plan-wizard/exercise-list';
import { Toggle } from '@/components/ui/toggle';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function PlanPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [showExerciseModal, setShowExerciseModal] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);

  // Step 2 state
  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [weekNumber, setWeekNumber] = useState(1);
  const [generateMonthly, setGenerateMonthly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const has531Exercises = exercises.some((ex) => ex.method === '531');
  const selectedWeek = has531Exercises ? weekNumber : 1;
  const remainingWeeks = Math.max(1, 5 - selectedWeek);
  const weeklyLabel = remainingWeeks === 1 ? 'semana' : 'semanas';

  const handleAddExercise = (exercise: Exercise) => {
    if (editingIndex === null) {
      setExercises([...exercises, exercise]);
      setShowExerciseModal(false);
      return;
    }

    const updated = [...exercises];
    updated[editingIndex] = exercise;
    setExercises(updated);
    setEditingIndex(null);
    setShowExerciseModal(false);
  };

  const handleEditExercise = (index: number) => {
    setEditingIndex(index);
    setShowExerciseModal(true);
  };

  const handleConfirmDelete = (index: number) => {
    setDeleteIndex(index);
    setShowDeleteConfirm(true);
  };

  const handleReorderExercises = (fromIndex: number, toIndex: number) => {
    setExercises((currentExercises) => {
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= currentExercises.length ||
        toIndex >= currentExercises.length
      ) {
        return currentExercises;
      }

      const reordered = [...currentExercises];
      const [moved] = reordered.splice(fromIndex, 1);
      if (!moved) {
        return currentExercises;
      }

      reordered.splice(toIndex, 0, moved);
      return reordered;
    });
  };

  const handleDeleteExercise = () => {
    if (deleteIndex !== null) {
      setExercises(exercises.filter((_, i) => i !== deleteIndex));
      setDeleteIndex(null);
    }
    setShowDeleteConfirm(false);
  };

  const handleNextStep = () => {
    if (exercises.length === 0) {
      setError('Please add at least one exercise');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleSavePlan = async () => {
    if (!startDate) {
      setError('Please select a start date');
      return;
    }

    if (has531Exercises && !weekNumber) {
      setError('Please select a week number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        exercises: exercises.map((ex) => ({
          name: ex.name,
          liftId: ex.liftId,
          method: ex.method,
          oneRm: ex.oneRm,
          sets: ex.sets,
          weight: ex.weight,
          reps: ex.reps,
          unit: ex.unit,
        })),
        startDate,
        weekNumber: has531Exercises ? weekNumber : 1,
        generateMonthly,
      };

      const res = await fetch('/api/plan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        if (Array.isArray(data.issues) && data.issues.length > 0) {
          throw new Error(data.issues.map((i: { path?: unknown; message?: string }) => `${Array.isArray(i.path) ? i.path.join('.') : 'set'}: ${i.message ?? 'invalid'}`).join(' • '));
        }
        throw new Error(data.detail || 'Failed to generate plan');
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="app-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white">
            {step === 1 ? 'Nuevo Plan — Ejercicios' : 'Nuevo Plan — Programar'}
          </h1>
          <p className="mt-2 text-gray-400">
            {step === 1 ? 'Paso 1 de 2' : 'Paso 2 de 2'}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500 bg-red-500/20 p-3 text-red-200">
            {error}
          </div>
        )}

        {/* Step 1: Exercises */}
        {step === 1 && (
          <div className="panel space-y-6 p-5 sm:p-6">
            <ExerciseList
              exercises={exercises}
              onEdit={handleEditExercise}
              onDelete={handleConfirmDelete}
              onReorder={handleReorderExercises}
            />

            {/* Floating Action Button */}
            <div className="fixed bottom-8 right-8">
              <button
                onClick={() => {
                  setEditingIndex(null);
                  setShowExerciseModal(true);
                }}
                className="btn-accent flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold shadow-lg"
              >
                +
              </button>
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-3 justify-between pt-6">
              <button
                onClick={() => router.push('/')}
                className="btn-dark flex-1 px-4 py-3 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleNextStep}
                disabled={exercises.length === 0}
                className="btn-accent flex-1 px-4 py-3 font-bold disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 2 && (
          <div className="panel space-y-6 p-5 sm:p-6">
            <div>
              <label htmlFor="plan-start-date" className="block text-sm font-medium text-gray-300 mb-2">
                Fecha de Inicio
              </label>
              <input
                id="plan-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                title="Fecha de inicio"
                className="field-dark"
              />
            </div>

            {has531Exercises && (
              <div>
                <label htmlFor="plan-week-number" className="block text-sm font-medium text-gray-300 mb-2">
                  Semana del Plan
                </label>
                <select
                  id="plan-week-number"
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(Number.parseInt(e.target.value, 10))}
                  title="Semana del plan"
                  className="field-dark"
                >
                  <option value={1}>Semana 1</option>
                  <option value={2}>Semana 2</option>
                  <option value={3}>Semana 3</option>
                  <option value={4}>Semana 4 (Deload)</option>
                </select>
              </div>
            )}

            <div>
              <p className="block text-sm font-medium text-gray-300 mb-2">
                Generar plan mensual
              </p>
              <Toggle
                checked={generateMonthly}
                onChange={setGenerateMonthly}
                label={
                  generateMonthly
                    ? `Sí, generar ${remainingWeeks} ${weeklyLabel}`
                    : 'No, solo esta semana'
                }
              />
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-3 justify-between pt-6">
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                className="btn-dark flex-1 px-4 py-3 font-medium disabled:opacity-50"
              >
                Atrás
              </button>
              <button
                onClick={handleSavePlan}
                disabled={loading}
                className="btn-accent flex-1 px-4 py-3 font-bold disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Guardar Plan'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Exercise Form Modal */}
      {showExerciseModal && (
        <ExerciseFormModal
          isOpen={showExerciseModal}
          onClose={() => {
            setShowExerciseModal(false);
            setEditingIndex(null);
          }}
          onSave={handleAddExercise}
          initialExercise={editingIndex === null ? undefined : exercises[editingIndex]}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Eliminar Ejercicio"
        message="¿Estás seguro de que deseas eliminar este ejercicio?"
        onConfirm={handleDeleteExercise}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDanger
      />
    </main>
  );
}
