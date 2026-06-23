'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { MonthlyDayModal, type MonthlyDay, type Profile } from '@/components/plan-wizard/monthly-day-modal';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const LIFT_LABELS: Record<string, string> = { SQ: 'Squat', BP: 'Bench Press', DL: 'Dead Lift' };

export default function MonthlyPlanPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [days, setDays] = useState<MonthlyDay[]>([]);
  const [showDayModal, setShowDayModal] = useState(false);
  const [editingDayIndex, setEditingDayIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  // Step 2 state
  const [startWeek, setStartWeek] = useState(1);
  const [startDate, setStartDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const data = await fetchJsonWithInFlightDedup<{ profiles?: Profile[] }>(
          '/api/training/531/profile',
        );
        setProfiles(data.profiles ?? []);
      } catch (err) {
        console.error('Failed to fetch profiles:', err);
      }
    };

    const timer = globalThis.setTimeout(() => {
      void fetchProfiles();
    }, 0);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, []);

  const usedWeekdays = days.map((d) => d.weekday);

  const handleSaveDay = (day: MonthlyDay) => {
    if (editingDayIndex === null) {
      setDays([...days, day]);
    } else {
      const updated = [...days];
      updated[editingDayIndex] = day;
      setDays(updated);
      setEditingDayIndex(null);
    }
    setShowDayModal(false);
  };

  const handleDeleteDay = () => {
    if (deleteIndex !== null) {
      setDays(days.filter((_, i) => i !== deleteIndex));
      setDeleteIndex(null);
    }
    setShowDeleteConfirm(false);
  };

  const handleGenerate = async () => {
    if (days.length === 0) {
      setError('Agrega al menos un día');
      return;
    }

    if (!startDate) {
      setError('Selecciona una fecha de inicio');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        startDate,
        startWeek,
        days: days.map((day) => ({
          weekday: day.weekday,
          mainLift: day.mainLift,
          mainOneRm: day.mainOneRm,
          mainUnit: day.mainUnit,
          accessories: day.accessories.map((ex) => ({
            name: ex.name,
            liftId: ex.liftId,
            sets: ex.sets ?? [],
            unit: ex.unit ?? 'kg',
          })),
        })),
      };

      const res = await fetch('/api/plan/monthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to generate monthly plan');
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
            {step === 1 ? 'Plan Mensual — Días' : 'Plan Mensual — Programar'}
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

        {/* Step 1: Days */}
        {step === 1 && (
          <div className="panel space-y-6 p-5 sm:p-6">
            {/* Day cards */}
            {days.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <p>No hay días configurados. Click + para agregar uno.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {days.map((day, index) => (
                  <div
                    key={`${day.weekday}-${index}`}
                    className="panel-soft flex items-center justify-between rounded-xl p-4"
                  >
                    <div>
                      <p className="font-semibold text-white">
                        {WEEKDAY_LABELS[day.weekday]}
                      </p>
                      <p className="text-sm text-gray-400">
                        {day.mainLift
                          ? `${LIFT_LABELS[day.mainLift]} (5/3/1)`
                          : 'Sin principal'}
                        {day.accessories.length > 0
                          ? ` + ${day.accessories.length} accesorios`
                          : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingDayIndex(index);
                          setShowDayModal(true);
                        }}
                        className="btn-dark px-3 py-1 text-sm"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          setDeleteIndex(index);
                          setShowDeleteConfirm(true);
                        }}
                        className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-200 hover:bg-red-500/30 transition-colors"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Floating Action Button */}
            <div className="fixed bottom-8 right-8">
              <button
                onClick={() => {
                  setEditingDayIndex(null);
                  setShowDayModal(true);
                }}
                className="btn-accent flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold shadow-lg"
              >
                +
              </button>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 justify-between pt-6">
              <button
                onClick={() => router.push('/')}
                className="btn-dark flex-1 px-4 py-3 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (days.length === 0) {
                    setError('Agrega al menos un día');
                    return;
                  }
                  setError('');
                  setStep(2);
                }}
                disabled={days.length === 0}
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
              <label htmlFor="monthly-start-date" className="block text-sm font-medium text-gray-300 mb-2">
                Fecha de Inicio
              </label>
              <input
                id="monthly-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                title="Fecha de inicio"
                className="field-dark"
              />
            </div>

            <div>
              <label htmlFor="monthly-start-week" className="block text-sm font-medium text-gray-300 mb-2">
                Semana del Ciclo 5/3/1
              </label>
              <select
                id="monthly-start-week"
                value={startWeek}
                onChange={(e) => setStartWeek(Number.parseInt(e.target.value, 10))}
                title="Semana del ciclo"
                className="field-dark"
              >
                <option value={1}>Semana 1 (5/5/5+)</option>
                <option value={2}>Semana 2 (3/3/3+)</option>
                <option value={3}>Semana 3 (5/3/1+)</option>
                <option value={4}>Semana 4 (Deload)</option>
              </select>
              <p className="mt-2 text-xs text-gray-400">
                Se generarán 4 sesiones por día (una por cada semana del ciclo). Si no empezás en
                la semana 1, el ciclo se envuelve y el 1RM se incrementa para las semanas que pasan
                al ciclo siguiente.
              </p>
            </div>

            {/* Summary */}
            <div className="panel-soft rounded-xl p-3 space-y-1">
              <p className="text-sm font-medium text-gray-300">Resumen:</p>
              <p className="text-sm text-gray-400">
                {days.length} {days.length === 1 ? 'día' : 'días'} × 4 semanas ={' '}
                {days.length * 4} sesiones
              </p>
            </div>

            {/* Navigation */}
            <div className="flex gap-3 justify-between pt-6">
              <button
                onClick={() => setStep(1)}
                disabled={loading}
                className="btn-dark flex-1 px-4 py-3 font-medium disabled:opacity-50"
              >
                Atrás
              </button>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="btn-accent flex-1 px-4 py-3 font-bold disabled:opacity-50"
              >
                {loading ? 'Generando...' : 'Generar Plan Mensual'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Day Modal */}
      {showDayModal && (
        <MonthlyDayModal
          isOpen={showDayModal}
          onClose={() => {
            setShowDayModal(false);
            setEditingDayIndex(null);
          }}
          onSave={handleSaveDay}
          initialDay={editingDayIndex === null ? undefined : days[editingDayIndex]}
          profiles={profiles}
          usedWeekdays={usedWeekdays}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Eliminar Día"
        message="¿Estás seguro de que deseas eliminar este día?"
        onConfirm={handleDeleteDay}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmText="Eliminar"
        cancelText="Cancelar"
        isDanger
      />
    </main>
  );
}
