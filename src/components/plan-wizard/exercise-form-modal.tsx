'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';

export interface Exercise {
  id?: string;
  name: string;
  liftId?: 'SQ' | 'DL' | 'BP' | 'OHP';
  method: '531' | 'none';
  oneRm?: number;
  weight?: number;
  reps?: number;
  unit: 'kg' | 'lb';
}

interface ExerciseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (exercise: Exercise) => void;
  initialExercise?: Exercise;
}

const PRESET_EXERCISES = [
  { label: 'Bench Press', value: 'BP' },
  { label: 'Squat', value: 'SQ' },
  { label: 'Dead Lift', value: 'DL' },
  { label: 'Military Overhead Press', value: 'OHP' },
  { label: 'Custom', value: 'custom' },
];

export function ExerciseFormModal({
  isOpen,
  onClose,
  onSave,
  initialExercise,
}: ExerciseFormModalProps) {
  const [name, setName] = useState(initialExercise?.name || '');
  const [liftId, setLiftId] = useState<'SQ' | 'DL' | 'BP' | 'OHP' | 'custom'>(
    (initialExercise?.liftId as any) || 'BP'
  );
  const [method, setMethod] = useState<'531' | 'none'>(initialExercise?.method || '531');
  const [oneRm, setOneRm] = useState(initialExercise?.oneRm?.toString() || '');
  const [weight, setWeight] = useState(initialExercise?.weight?.toString() || '');
  const [reps, setReps] = useState(initialExercise?.reps?.toString() || '');
  const [unit, setUnit] = useState<'kg' | 'lb'>(initialExercise?.unit || 'kg');

  const handleSave = () => {
    let finalName = name;
    let finalLiftId: 'SQ' | 'DL' | 'BP' | 'OHP' | undefined;

    if (liftId === 'custom') {
      if (!finalName) {
        alert('Please enter a custom exercise name');
        return;
      }
    } else {
      finalLiftId = liftId as 'SQ' | 'DL' | 'BP' | 'OHP';
      finalName = PRESET_EXERCISES.find(e => e.value === liftId)?.label || name;
    }

    if (method === '531' && !oneRm) {
      alert('Please enter 1RM for 5/3/1 exercises');
      return;
    }

    if (method === 'none' && (!weight || !reps)) {
      alert('Please enter weight and reps for non-5/3/1 exercises');
      return;
    }

    const exercise: Exercise = {
      id: initialExercise?.id,
      name: finalName,
      liftId: finalLiftId,
      method,
      oneRm: method === '531' ? parseFloat(oneRm) : undefined,
      weight: method === 'none' ? parseFloat(weight) : undefined,
      reps: method === 'none' ? parseInt(reps) : undefined,
      unit,
    };

    onSave(exercise);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialExercise ? 'Editar Ejercicio' : 'Agregar Ejercicio'}>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Ejercicio
          </label>
          <select
            value={liftId}
            onChange={(e) => setLiftId(e.target.value as any)}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
          >
            {PRESET_EXERCISES.map((ex) => (
              <option key={ex.value} value={ex.value}>
                {ex.label}
              </option>
            ))}
          </select>
        </div>

        {liftId === 'custom' && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Nombre del Ejercicio
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Incline Bench Press"
              className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Método
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setMethod('531')}
              className={`flex-1 py-2 rounded transition-colors ${
                method === '531'
                  ? 'bg-[#d6ff43] text-gray-900'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              5/3/1
            </button>
            <button
              onClick={() => setMethod('none')}
              className={`flex-1 py-2 rounded transition-colors ${
                method === 'none'
                  ? 'bg-[#d6ff43] text-gray-900'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              None
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Unidad
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setUnit('kg')}
              className={`flex-1 py-2 rounded transition-colors ${
                unit === 'kg'
                  ? 'bg-[#d6ff43] text-gray-900'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              kg
            </button>
            <button
              onClick={() => setUnit('lb')}
              className={`flex-1 py-2 rounded transition-colors ${
                unit === 'lb'
                  ? 'bg-[#d6ff43] text-gray-900'
                  : 'bg-gray-700 text-white hover:bg-gray-600'
              }`}
            >
              lb
            </button>
          </div>
        </div>

        {method === '531' ? (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              1RM
            </label>
            <input
              type="number"
              step="0.5"
              value={oneRm}
              onChange={(e) => setOneRm(e.target.value)}
              placeholder="Ej: 150"
              className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
            />
          </div>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Peso
              </label>
              <input
                type="number"
                step="0.5"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="Ej: 80"
                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Repeticiones
              </label>
              <input
                type="number"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="Ej: 8"
                className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
              />
            </div>
          </>
        )}

        <div className="flex gap-3 justify-end pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded bg-[#d6ff43] text-gray-900 font-medium hover:bg-yellow-400 transition-colors"
          >
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
