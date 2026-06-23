'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { ExerciseFormModal, type Exercise } from './exercise-form-modal';
import { ExerciseList } from './exercise-list';

export interface MonthlyDay {
  weekday: number;
  mainLift?: 'SQ' | 'DL' | 'BP';
  mainOneRm?: number;
  mainUnit?: 'kg' | 'lb';
  accessories: Exercise[];
}

export interface Profile {
  liftId: string;
  cycleNumber: number;
  oneRm: number;
  unit: string;
}

interface MonthlyDayModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSave: (day: MonthlyDay) => void;
  readonly initialDay?: MonthlyDay;
  readonly profiles: Profile[];
  readonly usedWeekdays: number[];
}

const WEEKDAYS = [
  { label: 'Lunes', value: 1 },
  { label: 'Martes', value: 2 },
  { label: 'Miércoles', value: 3 },
  { label: 'Jueves', value: 4 },
  { label: 'Viernes', value: 5 },
  { label: 'Sábado', value: 6 },
  { label: 'Domingo', value: 0 },
];

const MAIN_LIFTS = [
  { label: 'Ninguno', value: '' },
  { label: 'Squat', value: 'SQ' },
  { label: 'Bench Press', value: 'BP' },
  { label: 'Dead Lift', value: 'DL' },
] as const;

export function MonthlyDayModal({
  isOpen,
  onClose,
  onSave,
  initialDay,
  profiles,
  usedWeekdays,
}: Readonly<MonthlyDayModalProps>) {
  const [weekday, setWeekday] = useState(initialDay?.weekday ?? 1);
  const [mainLift, setMainLift] = useState<string>(initialDay?.mainLift ?? '');
  const [oneRm, setOneRm] = useState(
    initialDay?.mainOneRm?.toString() ?? '',
  );
  const [unit, setUnit] = useState<'kg' | 'lb'>(initialDay?.mainUnit ?? 'kg');
  const [accessories, setAccessories] = useState<Exercise[]>(
    initialDay?.accessories ?? [],
  );
  const [showAccessoryModal, setShowAccessoryModal] = useState(false);
  const [editingAccessoryIndex, setEditingAccessoryIndex] = useState<number | null>(null);

  const profileForLift = mainLift
    ? profiles.find((p) => p.liftId === mainLift)
    : undefined;
  const needsOneRm = Boolean(mainLift) && !profileForLift;

  const handleAddAccessory = (exercise: Exercise) => {
    if (editingAccessoryIndex === null) {
      setAccessories([...accessories, exercise]);
    } else {
      const updated = [...accessories];
      updated[editingAccessoryIndex] = exercise;
      setAccessories(updated);
      setEditingAccessoryIndex(null);
    }
    setShowAccessoryModal(false);
  };

  const handleSave = () => {
    if (usedWeekdays.includes(weekday) && weekday !== initialDay?.weekday) {
      alert('Ese día ya está configurado');
      return;
    }

    if (needsOneRm && !oneRm) {
      alert('Ingresa el 1RM para el ejercicio principal');
      return;
    }

    const day: MonthlyDay = {
      weekday,
      accessories,
    };

    if (mainLift) {
      day.mainLift = mainLift as 'SQ' | 'DL' | 'BP';
      if (needsOneRm) {
        day.mainOneRm = Number.parseFloat(oneRm);
        day.mainUnit = unit;
      }
    }

    onSave(day);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialDay ? 'Editar Día' : 'Agregar Día'}
    >
      <div className="space-y-4">
        {/* Weekday picker */}
        <div>
          <p className="block text-sm font-medium text-gray-300 mb-2">Día de la semana</p>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const isUsed = usedWeekdays.includes(day.value) && day.value !== initialDay?.weekday;
              return (
                <button
                  key={day.value}
                  onClick={() => setWeekday(day.value)}
                  disabled={isUsed}
                  className={`px-3 py-2 rounded-xl text-sm transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    weekday === day.value ? 'btn-accent' : 'btn-dark'
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Main lift picker */}
        <div>
          <label htmlFor="main-lift-picker" className="block text-sm font-medium text-gray-300 mb-2">
            Ejercicio Principal
          </label>
          <select
            id="main-lift-picker"
            value={mainLift}
            onChange={(e) => {
              setMainLift(e.target.value);
              setOneRm('');
            }}
            title="Seleccionar ejercicio principal"
            className="field-dark"
          >
            {MAIN_LIFTS.map((lift) => (
              <option key={lift.value} value={lift.value}>
                {lift.label}
              </option>
            ))}
          </select>
        </div>

        {/* 1RM input — only when no existing profile for this lift */}
        {needsOneRm && (
          <div className="panel-soft rounded-xl p-3 space-y-3">
            <p className="text-sm text-gray-300">
              No hay perfil 5/3/1 para este lift. Ingresa el 1RM para crearlo:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="main-one-rm" className="block text-xs text-gray-400 mb-1">1RM</label>
                <input
                  id="main-one-rm"
                  type="number"
                  step="0.5"
                  value={oneRm}
                  onChange={(e) => setOneRm(e.target.value)}
                  placeholder="Ej: 150"
                  className="field-dark"
                />
              </div>
              <div>
                <p className="block text-xs text-gray-400 mb-1">Unidad</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setUnit('kg')}
                    className={`flex-1 py-2 rounded-xl text-sm ${unit === 'kg' ? 'btn-accent' : 'btn-dark'}`}
                  >
                    kg
                  </button>
                  <button
                    onClick={() => setUnit('lb')}
                    className={`flex-1 py-2 rounded-xl text-sm ${unit === 'lb' ? 'btn-accent' : 'btn-dark'}`}
                  >
                    lb
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Existing profile info */}
        {profileForLift && (
          <div className="panel-soft rounded-xl p-3">
            <p className="text-sm text-gray-300">
              Perfil existente: <span className="font-semibold">{profileForLift.liftId}</span>{' '}
              — 1RM {profileForLift.oneRm} {profileForLift.unit}, Ciclo {profileForLift.cycleNumber}
            </p>
          </div>
        )}

        {/* Accessories */}
        <div>
          <p className="block text-sm font-medium text-gray-300 mb-2">Ejercicios Accesorios</p>
          <ExerciseList
            exercises={accessories}
            onEdit={(index) => {
              setEditingAccessoryIndex(index);
              setShowAccessoryModal(true);
            }}
            onDelete={(index) => {
              setAccessories(accessories.filter((_, i) => i !== index));
            }}
            onReorder={(from, to) => {
              const reordered = [...accessories];
              const [moved] = reordered.splice(from, 1);
              if (moved) {
                reordered.splice(to, 0, moved);
                setAccessories(reordered);
              }
            }}
          />
          <button
            onClick={() => {
              setEditingAccessoryIndex(null);
              setShowAccessoryModal(true);
            }}
            className="btn-dark w-full py-2 mt-2 text-sm"
          >
            + Añadir Accesorio
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end pt-4">
          <button onClick={onClose} className="btn-dark px-4 py-2">
            Cancelar
          </button>
          <button onClick={handleSave} className="btn-accent px-4 py-2 font-medium">
            Guardar
          </button>
        </div>
      </div>

      {showAccessoryModal && (
        <ExerciseFormModal
          isOpen={showAccessoryModal}
          onClose={() => {
            setShowAccessoryModal(false);
            setEditingAccessoryIndex(null);
          }}
          onSave={handleAddAccessory}
          initialExercise={editingAccessoryIndex === null ? undefined : accessories[editingAccessoryIndex]}
          accessoryOnly
        />
      )}
    </Modal>
  );
}
