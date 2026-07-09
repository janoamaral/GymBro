'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';

export interface ExerciseSetInput {
  reps?: number;
  weight: number;
  durationSeconds?: number;
  distanceMeters?: number;
  bodyweight?: boolean;
}

export type SetMeasure = 'reps' | 'time' | 'distance';

export function inferMeasureFromSet(set: { durationSeconds?: number | null; distanceMeters?: number | null }): SetMeasure {
  if (set.durationSeconds != null && set.durationSeconds > 0) return 'time';
  if (set.distanceMeters != null && Number(set.distanceMeters) > 0) return 'distance';
  return 'reps';
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
  durationSeconds?: number;
  distanceMeters?: number;
  bodyweight?: boolean;
  unit?: 'kg' | 'lb';
}

interface ExerciseFormModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (exercise: Exercise) => void;
  readonly initialExercise?: Exercise;
  readonly accessoryOnly?: boolean;
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
  measure: SetMeasure;
  bodyweight: boolean;
  reps: string;
  weight: string;
  duration: string;
  distance: string;
}

const createEditableSet = (
  values?: Partial<Pick<EditableSet, 'measure' | 'bodyweight' | 'reps' | 'weight' | 'duration' | 'distance'>>
): EditableSet => ({
  id: globalThis.crypto.randomUUID(),
  measure: values?.measure ?? 'reps',
  bodyweight: values?.bodyweight ?? false,
  reps: values?.reps ?? '',
  weight: values?.weight ?? '',
  duration: values?.duration ?? '',
  distance: values?.distance ?? '',
});

export function ExerciseFormModal({
  isOpen,
  onClose,
  onSave,
  initialExercise,
  accessoryOnly = false,
}: Readonly<ExerciseFormModalProps>) {
  const [name, setName] = useState(initialExercise?.name || '');
  const [liftId, setLiftId] = useState<ExercisePickerValue>(
    accessoryOnly ? 'custom' : (initialExercise?.liftId ?? 'BP')
  );
  const [method, setMethod] = useState<'531' | 'none'>(
    accessoryOnly ? 'none' : (initialExercise?.method ?? '531')
  );
  const [oneRm, setOneRm] = useState(initialExercise?.oneRm?.toString() || '');
  const [sets, setSets] = useState<EditableSet[]>(() => {
    if (initialExercise?.sets && initialExercise.sets.length > 0) {
      return initialExercise.sets.map((set) => createEditableSet({
        measure: inferMeasureFromSet(set),
        bodyweight: set.bodyweight === true || set.weight === 0,
        reps: set.reps?.toString() ?? '',
        weight: set.weight.toString(),
        duration: set.durationSeconds != null ? set.durationSeconds.toString() : '',
        distance: set.distanceMeters != null ? set.distanceMeters.toString() : '',
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

  const updateSetField = (index: number, field: keyof EditableSet, value: string | boolean) => {
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

  const editableSetFields = (set: EditableSet) => ({
    measure: set.measure,
    bodyweight: set.bodyweight,
    reps: set.reps,
    weight: set.weight,
    duration: set.duration,
    distance: set.distance,
  });

  const cloneSet = (index: number) => {
    setSets((currentSets) => {
      const sourceSet = currentSets[index];
      if (!sourceSet) {
        return currentSets;
      }

      return [...currentSets, createEditableSet(editableSetFields(sourceSet))];
    });
  };

  const setMeasureComplete = (set: EditableSet): boolean => {
    if (set.measure === 'reps') return Boolean(set.reps) && (set.bodyweight || Boolean(set.weight));
    if (set.measure === 'time') return Boolean(set.duration) && (set.bodyweight || Boolean(set.weight));
    if (set.measure === 'distance') return Boolean(set.distance) && (set.bodyweight || Boolean(set.weight));
    return false;
  };

  const addIdenticalSetsFromLast = () => {
    const count = Number.parseInt(bulkCount, 10);

    if (Number.isNaN(count) || count <= 0) {
      alert('Ingresá una cantidad válida de sets a duplicar');
      return;
    }

    const sourceSet = sets.at(-1);
    if (!sourceSet || !setMeasureComplete(sourceSet)) {
      alert('Completá el último set antes de duplicar');
      return;
    }

    const rest = editableSetFields(sourceSet);
    setSets((currentSets) => [
      ...currentSets,
      ...Array.from({ length: count }, () => createEditableSet(rest)),
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
          if (!setMeasureComplete(set)) {
            throw new Error(`Set ${index + 1}: incompleto`);
          }

          const weight = set.bodyweight ? 0 : Number.parseFloat(set.weight);
          if (!Number.isFinite(weight) || weight < 0) {
            throw new Error(`Set ${index + 1}: peso inválido`);
          }

          const input: ExerciseSetInput = { weight };
          if (set.bodyweight) input.bodyweight = true;

          if (set.measure === 'reps') {
            const reps = Number.parseInt(set.reps, 10);
            if (!Number.isInteger(reps) || reps <= 0) {
              throw new Error(`Set ${index + 1}: reps inválidas`);
            }
            input.reps = reps;
          } else if (set.measure === 'time') {
            const durationSeconds = Number.parseInt(set.duration, 10);
            if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) {
              throw new Error(`Set ${index + 1}: tiempo inválido`);
            }
            input.durationSeconds = durationSeconds;
          } else {
            const distanceMeters = Number.parseFloat(set.distance);
            if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
              throw new Error(`Set ${index + 1}: distancia inválida`);
            }
            input.distanceMeters = distanceMeters;
          }

          return input;
        });
      } catch (err) {
        alert(err instanceof Error && err.message ? err.message : 'Revisá los sets antes de guardar');
        return;
      }
    }

    if (method === 'none' && parsedSets.length === 0) {
      return;
    }

    const firstReps = parsedSets[0]?.reps;

    const exercise: Exercise = {
      id: initialExercise?.id,
      name: finalName,
      liftId: finalLiftId,
      method,
      oneRm: method === '531' ? Number.parseFloat(oneRm) : undefined,
      sets: method === 'none' ? parsedSets : undefined,
      weight: method === 'none' ? parsedSets[0]?.weight : undefined,
      reps: method === 'none' ? firstReps : undefined,
      durationSeconds: method === 'none' ? parsedSets[0]?.durationSeconds : undefined,
      distanceMeters: method === 'none' ? parsedSets[0]?.distanceMeters : undefined,
      bodyweight: method === 'none' ? parsedSets[0]?.bodyweight : undefined,
      unit,
    };

    onSave(exercise);
    onClose();
  };

    return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialExercise ? 'Editar Ejercicio' : 'Agregar Ejercicio'}>
      <div className="space-y-4">
        {!accessoryOnly && (
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
        )}

        {(liftId === 'custom' || accessoryOnly) && (
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

        {!accessoryOnly && (
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
        )}

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

                    <div>
                      <p className="block text-xs text-gray-400 mb-1">Medida</p>
                      <div className="flex gap-1">
                        {([
                          { value: 'reps', label: 'Reps' },
                          { value: 'time', label: 'Tiempo' },
                          { value: 'distance', label: 'Distancia' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => updateSetField(index, 'measure', opt.value)}
                            className={`flex-1 py-1.5 rounded-lg text-xs transition-colors ${
                              set.measure === opt.value ? 'btn-accent' : 'btn-dark'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {set.measure === 'reps' && (
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
                      )}
                      {set.measure === 'time' && (
                        <div>
                          <label htmlFor={`set-duration-${set.id}`} className="block text-xs text-gray-400 mb-1">Segundos</label>
                          <input
                            id={`set-duration-${set.id}`}
                            type="number"
                            value={set.duration}
                            onChange={(e) => updateSetField(index, 'duration', e.target.value)}
                            placeholder="Ej: 45"
                            className="field-dark"
                          />
                        </div>
                      )}
                      {set.measure === 'distance' && (
                        <div>
                          <label htmlFor={`set-distance-${set.id}`} className="block text-xs text-gray-400 mb-1">M metros</label>
                          <input
                            id={`set-distance-${set.id}`}
                            type="number"
                            step="0.5"
                            value={set.distance}
                            onChange={(e) => updateSetField(index, 'distance', e.target.value)}
                            placeholder="Ej: 30"
                            className="field-dark"
                          />
                        </div>
                      )}
                      <div>
                        <label htmlFor={`set-weight-${set.id}`} className="block text-xs text-gray-400 mb-1">
                          {set.bodyweight ? 'Peso corporal' : 'Peso'}
                        </label>
                        {set.bodyweight ? (
                          <div className="field-dark flex items-center justify-between px-3">
                            <span className="text-sm text-gray-300">BW</span>
                            <button
                              type="button"
                              onClick={() => updateSetField(index, 'bodyweight', false)}
                              className="text-xs px-2 py-1 rounded bg-white/5 text-gray-300 hover:bg-white/10"
                            >
                              Quitar BW
                            </button>
                          </div>
                        ) : (
                          <input
                            id={`set-weight-${set.id}`}
                            type="number"
                            step="0.5"
                            value={set.weight}
                            onChange={(e) => updateSetField(index, 'weight', e.target.value)}
                            placeholder="Ej: 80"
                            className="field-dark"
                          />
                        )}
                      </div>
                    </div>

                    {!set.bodyweight && (
                      <button
                        type="button"
                        onClick={() => updateSetField(index, 'bodyweight', true)}
                        className="text-xs px-2 py-1 rounded bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 transition-colors"
                      >
                        Usar peso corporal
                      </button>
                    )}
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
