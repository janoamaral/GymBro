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
  liftId?: 'SQ' | 'DL' | 'BP';
  method: '531' | 'none';
  oneRm?: number;
  sets?: ExerciseSetInput[];
  weight?: number;
  reps?: number;
  unit?: 'kg' | 'lb';
}

interface ExerciseFormModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (exercise: Exercise) => void;
  readonly initialExercise?: Exercise;
}

type ExercisePickerValue = 'SQ' | 'DL' | 'BP' | 'custom';

const PRESET_EXERCISES = [
  { label: 'Bench Press', value: 'BP' },
  { label: 'Squat', value: 'SQ' },
  { label: 'Dead Lift', value: 'DL' },
  { label: 'Custom', value: 'custom' },
];

interface EditableSet {
  id: string;
  reps: string;
  weight: string;
}

const createEditableSet = (values?: Partial<Pick<EditableSet, 'reps' | 'weight'>>): EditableSet => ({
  id: globalThis.crypto.randomUUID(),
  reps: values?.reps ?? '',
  weight: values?.weight ?? '',
});

export function ExerciseFormModal({
  isOpen,
  onClose,
  onSave,
  initialExercise,
}: Readonly<ExerciseFormModalProps>) {
  const [name, setName] = useState(initialExercise?.name || '');
  const [liftId, setLiftId] = useState<ExercisePickerValue>(
    initialExercise?.liftId || 'BP'
  );
  const [method, setMethod] = useState<'531' | 'none'>(initialExercise?.method || '531');
  const [oneRm, setOneRm] = useState(initialExercise?.oneRm?.toString() || '');
  const [sets, setSets] = useState<EditableSet[]>(() => {
    if (initialExercise?.sets && initialExercise.sets.length > 0) {
      return initialExercise.sets.map((set) => ({
        id: globalThis.crypto.randomUUID(),
        reps: set.reps.toString(),
        weight: set.weight.toString(),
      }));
    }

    if (initialExercise?.weight && initialExercise?.reps) {
      return [
        createEditableSet({
          reps: initialExercise.reps.toString(),
          weight: initialExercise.weight.toString(),
        }),
      ];
    }

    return [createEditableSet()];
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
    setSets((currentSets) => [...currentSets, createEditableSet()]);
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

      return [...currentSets, createEditableSet({ reps: sourceSet.reps, weight: sourceSet.weight })];
    });
  };

  const addIdenticalSetsFromLast = () => {
    const count = Number.parseInt(bulkCount, 10);

    if (Number.isNaN(count) || count <= 0) {
      alert('Please enter a valid number of sets to add');
      return;
    }

    const sourceSet = sets.at(-1);
    if (!sourceSet) {
      return;
    }

    if (!sourceSet.weight || !sourceSet.reps) {
      alert('Complete reps and weight in the last set before bulk cloning');
      return;
    }

    setSets((currentSets) => [
      ...currentSets,
      ...Array.from({ length: count }, () => createEditableSet({ reps: sourceSet.reps, weight: sourceSet.weight })),
    ]);
  };

  const handleSave = () => {
    let finalName = name;
    let finalLiftId: 'SQ' | 'DL' | 'BP' | undefined;

    if (liftId === 'custom') {
      if (!finalName) {
        alert('Please enter a custom exercise name');
        return;
      }
    } else {
      finalLiftId = liftId;
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
          const parsedWeight = Number.parseFloat(set.weight);
          const parsedReps = Number.parseInt(set.reps, 10);

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
      oneRm: method === '531' ? Number.parseFloat(oneRm) : undefined,
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
          <label htmlFor="exercise-picker" className="block text-sm font-medium text-gray-300 mb-2">
            Ejercicio
          </label>
          <select
            id="exercise-picker"
            value={liftId}
            onChange={(e) => setLiftId(e.target.value as ExercisePickerValue)}
            title="Seleccionar ejercicio"
            className="field-dark"
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
            <label htmlFor="custom-exercise-name" className="block text-sm font-medium text-gray-300 mb-2">
              Nombre del Ejercicio
            </label>
            <input
              id="custom-exercise-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Incline Bench Press"
              className="field-dark"
            />
          </div>
        )}

        <div>
          <p className="block text-sm font-medium text-gray-300 mb-2">
            Método
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setMethod('531')}
              className={`flex-1 py-2 rounded-xl transition-colors ${
                method === '531'
                  ? 'btn-accent'
                  : 'btn-dark'
              }`}
            >
              5/3/1
            </button>
            <button
              onClick={() => setMethod('none')}
              className={`flex-1 py-2 rounded-xl transition-colors ${
                method === 'none'
                  ? 'btn-accent'
                  : 'btn-dark'
              }`}
            >
              None
            </button>
          </div>
        </div>

        <div>
          <p className="block text-sm font-medium text-gray-300 mb-2">
            Unidad
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setUnit('kg')}
              className={`flex-1 py-2 rounded-xl transition-colors ${
                unit === 'kg'
                  ? 'btn-accent'
                  : 'btn-dark'
              }`}
            >
              kg
            </button>
            <button
              onClick={() => setUnit('lb')}
              className={`flex-1 py-2 rounded-xl transition-colors ${
                unit === 'lb'
                  ? 'btn-accent'
                  : 'btn-dark'
              }`}
            >
              lb
            </button>
          </div>
        </div>

        {method === '531' ? (
          <div>
            <label htmlFor="exercise-one-rm" className="block text-sm font-medium text-gray-300 mb-2">
              1RM
            </label>
            <input
              id="exercise-one-rm"
              type="number"
              step="0.5"
              value={oneRm}
              onChange={(e) => setOneRm(e.target.value)}
              placeholder="Ej: 150"
              className="field-dark"
            />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="block text-sm font-medium text-gray-300">
                  Sets
                </p>
                <button
                  type="button"
                  onClick={addEmptySet}
                  className="btn-dark px-3 py-1 text-sm"
                >
                  + Añadir Set
                </button>
              </div>

              <div className="space-y-2">
                {sets.map((set, index) => (
                  <div key={set.id} className="panel-soft rounded-xl p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-300 font-medium">Set {index + 1}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => cloneSet(index)}
                          className="btn-dark px-2 py-1 text-xs"
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
                        <label htmlFor={`set-weight-${set.id}`} className="block text-xs text-gray-400 mb-1">Peso</label>
                        <input
                          id={`set-weight-${set.id}`}
                          type="number"
                          step="0.5"
                          value={set.weight}
                          onChange={(e) => updateSetField(index, 'weight', e.target.value)}
                          placeholder="Ej: 80"
                          className="field-dark"
                        />
                      </div>
                      <div>
                        <label htmlFor={`set-reps-${set.id}`} className="block text-xs text-gray-400 mb-1">Reps</label>
                        <input
                          id={`set-reps-${set.id}`}
                          type="number"
                          value={set.reps}
                          onChange={(e) => updateSetField(index, 'reps', e.target.value)}
                          placeholder="Ej: 8"
                          className="field-dark"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel-soft rounded-xl p-3 space-y-2">
              <p className="text-sm text-gray-300 font-medium">Acción rápida para series lineales</p>
              <div className="flex gap-2 items-center">
                <input
                  aria-label="Cantidad de sets a duplicar"
                  title="Cantidad de sets a duplicar"
                  type="number"
                  min="1"
                  value={bulkCount}
                  onChange={(e) => setBulkCount(e.target.value)}
                  className="field-dark w-24"
                />
                <button
                  type="button"
                  onClick={addIdenticalSetsFromLast}
                  className="btn-dark px-3 py-2 text-sm"
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
            className="btn-dark px-4 py-2"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="btn-accent px-4 py-2 font-medium"
          >
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
