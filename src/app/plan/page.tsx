'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
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
  const [startDate, setStartDate] = useState('');
  const [weekNumber, setWeekNumber] = useState(1);
  const [generateMonthly, setGenerateMonthly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const has531Exercises = exercises.some((ex) => ex.method === '531');

  const handleAddExercise = (exercise: Exercise) => {
    if (editingIndex !== null) {
      const updated = [...exercises];
      updated[editingIndex] = exercise;
      setExercises(updated);
      setEditingIndex(null);
    } else {
      setExercises([...exercises, exercise]);
    }
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
        throw new Error(data.detail || 'Failed to generate plan');
      }

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Set default start date to tomorrow
  useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setStartDate(tomorrow.toISOString().split('T')[0]);
  });

  return (
    <main className="min-h-full bg-gray-900 px-4 py-8 sm:px-6 lg:px-8">
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
          <div className="mb-4 bg-red-500/20 border border-red-500 rounded p-3 text-red-200">
            {error}
          </div>
        )}

        {/* Step 1: Exercises */}
        {step === 1 && (
          <div className="space-y-6">
            <ExerciseList
              exercises={exercises}
              onEdit={handleEditExercise}
              onDelete={handleConfirmDelete}
            />

            {/* Floating Action Button */}
            <div className="fixed bottom-8 right-8">
              <button
                onClick={() => {
                  setEditingIndex(null);
                  setShowExerciseModal(true);
                }}
                className="h-16 w-16 rounded-full bg-[#d6ff43] text-gray-900 flex items-center justify-center shadow-lg hover:bg-yellow-400 transition-colors font-bold text-2xl"
              >
                +
              </button>
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-3 justify-between pt-6">
              <button
                onClick={() => router.push('/')}
                className="flex-1 px-4 py-3 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleNextStep}
                disabled={exercises.length === 0}
                className="flex-1 px-4 py-3 rounded bg-[#d6ff43] text-gray-900 hover:bg-yellow-400 transition-colors font-bold disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Fecha de Inicio
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
              />
            </div>

            {has531Exercises && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Semana del Plan
                </label>
                <select
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(parseInt(e.target.value))}
                  className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
                >
                  <option value={1}>Semana 1</option>
                  <option value={2}>Semana 2</option>
                  <option value={3}>Semana 3</option>
                  <option value={4}>Semana 4 (Deload)</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Generar plan mensual
              </label>
              <Toggle
                checked={generateMonthly}
                onChange={setGenerateMonthly}
                label={
                  generateMonthly
                    ? 'Sí, generar 4 semanas'
                    : 'No, solo esta semana'
                }
              />
            </div>

            {/* Navigation Buttons */}
            <div className="flex gap-3 justify-between pt-6">
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                className="flex-1 px-4 py-3 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors font-medium disabled:opacity-50"
              >
                Atrás
              </button>
              <button
                onClick={handleSavePlan}
                disabled={loading}
                className="flex-1 px-4 py-3 rounded bg-[#d6ff43] text-gray-900 hover:bg-yellow-400 transition-colors font-bold disabled:opacity-50"
              >
                {loading ? 'Guardando...' : 'Guardar Plan'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Exercise Form Modal */}
      <ExerciseFormModal
        isOpen={showExerciseModal}
        onClose={() => {
          setShowExerciseModal(false);
          setEditingIndex(null);
        }}
        onSave={handleAddExercise}
        initialExercise={editingIndex !== null ? exercises[editingIndex] : undefined}
      />

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
