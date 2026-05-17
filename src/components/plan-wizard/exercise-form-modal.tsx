'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';

export interface ExerciseSetInput {
  reps: number;
  weight: number;
}

export interface Exercise {
  id?: string;
  name: string;
  liftId?: 'SQ' | 'DL' | 'BP' | 'OHP';
  method: '531' | 'none';
  oneRm?: number;
  sets?: ExerciseSetInput[];
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

type ExercisePickerValue = 'SQ' | 'DL' | 'BP' | 'OHP' | 'custom';

const PRESET_EXERCISES = [
  { label: 'Bench Press', value: 'BP' },
  { label: 'Squat', value: 'SQ' },
  { label: 'Dead Lift', value: 'DL' },
  { label: 'Military Overhead Press', value: 'OHP' },
  { label: 'Custom', value: 'custom' },
];

interface EditableSet {
  reps: string;
  weight: string;
}

const EMPTY_SET: EditableSet = {
  reps: '',
  weight: '',
};

export function ExerciseFormModal({
  isOpen,
  onClose,
  onSave,
  initialExercise,
}: ExerciseFormModalProps) {
  const [name, setName] = useState(initialExercise?.name || '');
  const [liftId, setLiftId] = useState<ExercisePickerValue>(
    initialExercise?.liftId || 'BP'
  );
  const [method, setMethod] = useState<'531' | 'none'>(initialExercise?.method || '531');
  const [oneRm, setOneRm] = useState(initialExercise?.oneRm?.toString() || '');
  const [sets, setSets] = useState<EditableSet[]>(() => {
    if (initialExercise?.sets && initialExercise.sets.length > 0) {
      return initialExercise.sets.map((set) => ({
        reps: set.reps.toString(),
        weight: set.weight.toString(),
      }));
    }

    if (initialExercise?.weight && initialExercise?.reps) {
      return [{ reps: initialExercise.reps.toString(), weight: initialExercise.weight.toString() }];
    }

    return [{ ...EMPTY_SET }];
  });
  const [bulkCount, setBulkCount] = useState('1');
  const [unit, setUnit] = useState<'kg' | 'lb'>(initialExercise?.unit || 'kg');

  const updateSetField = (index: number, field: keyof EditableSet, value: string) => {
    setSets((currentSets) =>
      currentSets.map((set, setIndex) =>
        setIndex === index
          ? {
              ...set,
              [field]: value,
            }
          : set
      )
    );
  };

  const addEmptySet = () => {
    setSets((currentSets) => [...currentSets, { ...EMPTY_SET }]);
  };

  const removeSet = (index: number) => {
    setSets((currentSets) => {
      if (currentSets.length === 1) {
        return currentSets;
      }

      return currentSets.filter((_, setIndex) => setIndex !== index);
    });
  };

  const cloneSet = (index: number) => {
    setSets((currentSets) => {
      const sourceSet = currentSets[index];
      if (!sourceSet) {
        return currentSets;
      }

      return [...currentSets, { ...sourceSet }];
    });
  };

  const addIdenticalSetsFromLast = () => {
    const count = parseInt(bulkCount, 10);

    if (Number.isNaN(count) || count <= 0) {
      alert('Please enter a valid number of sets to add');
      return;
    }

    const sourceSet = sets[sets.length - 1];
    if (!sourceSet) {
      return;
    }

    if (!sourceSet.weight || !sourceSet.reps) {
      alert('Complete reps and weight in the last set before bulk cloning');
      return;
    }

    setSets((currentSets) => [
      ...currentSets,
      ...Array.from({ length: count }, () => ({ ...sourceSet })),
    ]);
  };

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

    let parsedSets: ExerciseSetInput[] = [];

    if (method === 'none') {
      try {
        parsedSets = sets.map((set, index) => {
          const parsedWeight = parseFloat(set.weight);
          const parsedReps = parseInt(set.reps, 10);

          if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
            throw new Error(`Set ${index + 1}: invalid weight`);
          }

          if (!Number.isInteger(parsedReps) || parsedReps <= 0) {
            throw new Error(`Set ${index + 1}: invalid reps`);
          }

          return {
            weight: parsedWeight,
            reps: parsedReps,
          };
        });
      } catch {
        alert('Please provide valid weight and reps for each set');
        return;
      }
    }

    if (method === 'none' && parsedSets.length === 0) {
      return;
    }

    const exercise: Exercise = {
      id: initialExercise?.id,
      name: finalName,
      liftId: finalLiftId,
      method,
      oneRm: method === '531' ? parseFloat(oneRm) : undefined,
      sets: method === 'none' ? parsedSets : undefined,
      weight: method === 'none' ? parsedSets[0]?.weight : undefined,
      reps: method === 'none' ? parsedSets[0]?.reps : undefined,
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
            onChange={(e) => setLiftId(e.target.value as ExercisePickerValue)}
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-300">
                  Sets
                </label>
                <button
                  type="button"
                  onClick={addEmptySet}
                  className="text-sm px-3 py-1 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors"
                >
                  + Añadir Set
                </button>
              </div>

              <div className="space-y-2">
                {sets.map((set, index) => (
                  <div key={`set-${index}`} className="bg-gray-800/70 rounded p-3 border border-gray-700 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-300 font-medium">Set {index + 1}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => cloneSet(index)}
                          className="text-xs px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors"
                        >
                          Clonar
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSet(index)}
                          disabled={sets.length === 1}
                          className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-colors disabled:opacity-40"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Peso</label>
                        <input
                          type="number"
                          step="0.5"
                          value={set.weight}
                          onChange={(e) => updateSetField(index, 'weight', e.target.value)}
                          placeholder="Ej: 80"
                          className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Reps</label>
                        <input
                          type="number"
                          value={set.reps}
                          onChange={(e) => updateSetField(index, 'reps', e.target.value)}
                          placeholder="Ej: 8"
                          className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800/60 border border-gray-700 rounded p-3 space-y-2">
              <p className="text-sm text-gray-300 font-medium">Acción rápida para series lineales</p>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  min="1"
                  value={bulkCount}
                  onChange={(e) => setBulkCount(e.target.value)}
                  className="w-24 bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
                />
                <button
                  type="button"
                  onClick={addIdenticalSetsFromLast}
                  className="px-3 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors text-sm"
                >
                  Añadir X sets idénticos
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Duplica el último set completo para acelerar la carga.
              </p>
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
