'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FullscreenLoader } from '@/components/ui/fullscreen-loader';
import { fetchJsonWithInFlightDedup } from '@/lib/fetch-json-with-in-flight-dedup';
import {
  listOfflineQueueMutations,
  offlineSyncEventName,
  type QueueMutation,
} from '@/lib/offline-queue';

type LiftId = 'SQ' | 'DL' | 'BP';

type TrainingProfile = {
  liftId: LiftId;
  oneRm: number;
  cycleNumber: number;
  unit: 'kg' | 'lb';
};

const KG_PLATE_OPTIONS = [1.25, 2.5, 5, 10, 15, 20, 25] as const;

export default function SettingsPage() {
  const router = useRouter();
  const [cycleIncrement531, setCycleIncrement531] = useState(5);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [defaultUnit, setDefaultUnit] = useState<'kg' | 'lb'>('kg');
  const [competitionSex, setCompetitionSex] = useState<'male' | 'female'>('male');
  const [availablePlatesKg, setAvailablePlatesKg] = useState<number[]>([...KG_PLATE_OPTIONS]);
  const [profiles, setProfiles] = useState<TrainingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [pendingMutations, setPendingMutations] = useState<QueueMutation[]>([]);

  const showMessage = (text: string, type: 'success' | 'error' = 'success') => {
    setMessageType(type);
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [settingsRes, profileRes] = await Promise.all([
          fetchJsonWithInFlightDedup<{ settings?: {
            cycleIncrement531?: number;
            displayName?: string | null;
            avatarUrl?: string | null;
            defaultUnit?: 'kg' | 'lb';
            competitionSex?: 'male' | 'female';
            availablePlatesKg?: number[];
          } }>('/api/user/settings'),
          fetchJsonWithInFlightDedup<{ profiles?: Array<{
            liftId: LiftId;
            oneRm: number | string;
            cycleNumber: number;
            unit: 'kg' | 'lb';
          }> }>('/api/training/531/profile'),
        ]);

        const settingsData = settingsRes;
        const profileData = profileRes;

        if (settingsData.settings) {
          setCycleIncrement531(settingsData.settings.cycleIncrement531 ?? 5);
          setDisplayName(settingsData.settings.displayName ?? '');
          setAvatarUrl(settingsData.settings.avatarUrl ?? '');
          setDefaultUnit(settingsData.settings.defaultUnit === 'lb' ? 'lb' : 'kg');
          setCompetitionSex(settingsData.settings.competitionSex === 'female' ? 'female' : 'male');

          const fetchedPlates = Array.isArray(settingsData.settings.availablePlatesKg)
            ? settingsData.settings.availablePlatesKg
            : [...KG_PLATE_OPTIONS];

          setAvailablePlatesKg(KG_PLATE_OPTIONS.filter((plate) => fetchedPlates.includes(plate)));
        }

        if (Array.isArray(profileData.profiles)) {
          const parsedProfiles = profileData.profiles as Array<{
            liftId: LiftId;
            oneRm: number | string;
            cycleNumber: number;
            unit: 'kg' | 'lb';
          }>;

          setProfiles(
            parsedProfiles.map((profile) => ({
              liftId: profile.liftId,
              oneRm: Number(profile.oneRm),
              cycleNumber: Number(profile.cycleNumber),
              unit: profile.unit,
            }))
          );
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
        showMessage('No se pudo cargar la configuración', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadPendingMutations = async () => {
      try {
        const queued = await listOfflineQueueMutations();
        if (!cancelled) {
          setPendingMutations(queued);
        }
      } catch {
        if (!cancelled) {
          setPendingMutations([]);
        }
      }
    };

    void loadPendingMutations();

    const handleSyncUpdate = () => {
      void loadPendingMutations();
    };

    window.addEventListener(offlineSyncEventName, handleSyncUpdate);

    return () => {
      cancelled = true;
      window.removeEventListener(offlineSyncEventName, handleSyncUpdate);
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const requests: Promise<Response>[] = [
        fetch('/api/user/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cycleIncrement531,
            displayName: displayName.trim(),
            avatarUrl: avatarUrl.trim(),
            defaultUnit,
            competitionSex,
            availablePlatesKg,
          }),
        }),
      ];

      profiles.forEach((profile) => {
        requests.push(
          fetch('/api/training/531/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              liftId: profile.liftId,
              oneRm: profile.oneRm,
              cycleNumber: profile.cycleNumber,
              unit: profile.unit,
            }),
          })
        );
      });

      const responses = await Promise.all(requests);
      const hasError = responses.some((res) => !res.ok);
      if (hasError) {
        throw new Error('No se pudo guardar toda la configuración');
      }

      showMessage('Configuración guardada exitosamente', 'success');
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'An error occurred', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleProfileChange = (
    liftId: LiftId,
    field: 'oneRm' | 'cycleNumber' | 'unit',
    value: string
  ) => {
    setProfiles((current) =>
      current.map((profile) => {
        if (profile.liftId !== liftId) {
          return profile;
        }

        if (field === 'unit') {
          return { ...profile, unit: value as 'kg' | 'lb' };
        }

        if (field === 'cycleNumber') {
          const parsed = Number.parseInt(value, 10);
          return {
            ...profile,
            cycleNumber: Number.isFinite(parsed) ? Math.max(1, parsed) : profile.cycleNumber,
          };
        }

        const parsed = Number.parseFloat(value);
        return {
          ...profile,
          oneRm: Number.isFinite(parsed) ? Math.max(0.5, parsed) : profile.oneRm,
        };
      })
    );
  };

  const handleResetCycles = () => {
    setProfiles((current) =>
      current.map((profile) => ({
        ...profile,
        cycleNumber: 1,
      }))
    );
    showMessage('Ciclos reseteados a 1. Guarda para confirmar cambios.');
  };

  const handleTogglePlate = (plate: number) => {
    setAvailablePlatesKg((current) => {
      if (current.includes(plate)) {
        return current.filter((value) => value !== plate);
      }

      return KG_PLATE_OPTIONS.filter((value) => current.includes(value) || value === plate);
    });
  };

  if (loading) {
    return <FullscreenLoader label="Cargando configuración..." />;
  }

  return (
    <main className="app-canvas min-h-screen px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
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
          <h1 className="text-4xl font-bold text-white">Configuración</h1>
        </div>

        {message && (
          <div
            className={`mb-4 rounded-xl border p-3 ${
              messageType === 'success'
                ? 'border-green-500 bg-green-500/20 text-green-200'
                : 'border-red-500 bg-red-500/20 text-red-200'
            }`}
          >
            {message}
          </div>
        )}

        {/* Settings Form */}
        <div className="panel space-y-6 p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Perfil</h2>
            <p className="text-xs text-gray-400 mt-1 mb-4">
              Este alias y esta imagen se mostrarán en el saludo del dashboard.
            </p>

            <div className="space-y-4">
              <label htmlFor="display-name" className="block text-sm font-medium text-gray-300">
                Alias / Nombre
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                placeholder="Ej: Jano"
                className="field-dark"
              />

              <label htmlFor="avatar-url" className="block text-sm font-medium text-gray-300">
                Link de imagen (avatar)
              </label>
              <input
                id="avatar-url"
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="field-dark"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor="default-unit" className="block text-sm font-medium text-gray-300">
                  <span>Unidad por defecto</span>
                  <select
                    id="default-unit"
                    value={defaultUnit}
                    onChange={(e) => setDefaultUnit(e.target.value as 'kg' | 'lb')}
                    className="field-dark mt-1"
                  >
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                </label>

                <label htmlFor="competition-sex" className="block text-sm font-medium text-gray-300">
                  <span>Sexo competición</span>
                  <select
                    id="competition-sex"
                    value={competitionSex}
                    onChange={(e) => setCompetitionSex(e.target.value as 'male' | 'female')}
                    className="field-dark mt-1"
                  >
                    <option value="male">Masculino</option>
                    <option value="female">Femenino</option>
                  </select>
                </label>
              </div>

              <div>
                <p className="block text-sm font-medium text-gray-300">Plates disponibles (kg)</p>
                <p className="mt-1 text-xs text-gray-400">
                  Desactiva los plates que no hay en tu gym para que la calculadora no los use.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {KG_PLATE_OPTIONS.map((plate) => {
                    const isActive = availablePlatesKg.includes(plate);

                    return (
                      <button
                        key={plate}
                        type="button"
                        onClick={() => handleTogglePlate(plate)}
                        className={`w-16 rounded-md border border-[#2a3240] px-3 py-1.5 text-center text-sm font-semibold transition-colors ${
                          isActive ? 'bg-[#d6ff43] text-[#0c1100]' : 'bg-[#191f28] text-[#d5dae3]'
                        }`}
                        title={`Toggle plate ${plate} kg`}
                      >
                        {plate}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="cycle-increment" className="block text-sm font-medium text-gray-300 mb-2">
              Incremento por Ciclo 5/3/1
            </label>
            <p className="text-xs text-gray-400 mb-3">
              Cantidad de peso a agregar a cada levantamiento cuando inicies un nuevo ciclo
            </p>
            <div className="flex gap-2 items-center">
              <input
                id="cycle-increment"
                type="number"
                step="0.5"
                value={cycleIncrement531}
                onChange={(e) => {
                  const value = Number.parseFloat(e.target.value);
                  if (Number.isFinite(value)) {
                    setCycleIncrement531(value);
                  }
                }}
                min="0.5"
                max="50"
                className="field-dark w-24"
              />
              <span className="text-gray-300">kg</span>
            </div>
          </div>

          <div className="border-t border-gray-700 pt-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Perfiles 5/3/1</h2>
                <p className="text-xs text-gray-400">
                  Edita 1RM y ciclo actual por levantamiento.
                </p>
              </div>
              <button
                onClick={handleResetCycles}
                className="btn-dark px-3 py-2 text-sm"
              >
                Resetear ciclos
              </button>
            </div>

            {profiles.length === 0 ? (
              <p className="text-sm text-gray-400">No hay perfiles 5/3/1 cargados.</p>
            ) : (
              <div className="space-y-3">
                {profiles.map((profile) => (
                  <div
                    key={profile.liftId}
                    className="panel-soft grid grid-cols-1 gap-3 rounded-xl p-3 sm:grid-cols-4"
                  >
                    <div>
                      <p className="text-xs text-gray-400">Lift</p>
                      <p className="text-sm font-semibold text-white">{profile.liftId}</p>
                    </div>

                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-400">1RM</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        value={profile.oneRm}
                        onChange={(e) => handleProfileChange(profile.liftId, 'oneRm', e.target.value)}
                        className="field-dark"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-400">Ciclo</span>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={profile.cycleNumber}
                        onChange={(e) => handleProfileChange(profile.liftId, 'cycleNumber', e.target.value)}
                        className="field-dark"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-xs text-gray-400">Unidad</span>
                      <select
                        value={profile.unit}
                        onChange={(e) => handleProfileChange(profile.liftId, 'unit', e.target.value)}
                        className="field-dark"
                      >
                        <option value="kg">kg</option>
                        <option value="lb">lb</option>
                      </select>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-gray-700 pt-6">
            <h2 className="text-lg font-semibold text-white">Debug offline</h2>
            <p className="mt-1 text-xs text-gray-400">
              Cola local de cambios pendientes de sincronización.
            </p>

            {pendingMutations.length === 0 ? (
              <p className="mt-3 text-sm text-gray-300">No hay cambios pendientes.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {pendingMutations.map((mutation) => (
                  <div
                    key={mutation.id}
                    className="rounded-lg border border-white/10 bg-[#141a22] px-3 py-2 text-xs text-gray-200"
                  >
                    <p className="font-semibold uppercase tracking-[0.08em]">{mutation.type}</p>
                    <p className="mt-1 text-gray-400">target: {mutation.targetId}</p>
                    <p className="text-gray-400">intentos: {mutation.attempts}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <a
              href="/auth/logout"
              className="mr-auto px-4 py-2 rounded border border-red-500/70 text-red-200 hover:bg-red-500/20 transition-colors"
            >
              Cerrar sesión
            </a>
            <button
              onClick={() => router.back()}
              className="btn-dark px-4 py-2"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-accent px-4 py-2 font-medium disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
