'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();
  const [cycleIncrement531, setCycleIncrement531] = useState(5.0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/user/settings');
        const data = await res.json();
        if (data.settings) {
          setCycleIncrement531(data.settings.cycleIncrement531);
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');

    try {
      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleIncrement531 }),
      });

      if (!res.ok) {
        throw new Error('Failed to save settings');
      }

      setMessage('Configuración guardada exitosamente');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-full bg-gray-900 px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-gray-900 px-4 py-8 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 hover:bg-gray-800 rounded transition-colors"
          >
            <ArrowLeft size={24} className="text-white" />
          </button>
          <h1 className="text-4xl font-bold text-white">Configuración</h1>
        </div>

        {message && (
          <div className="mb-4 bg-green-500/20 border border-green-500 rounded p-3 text-green-200">
            {message}
          </div>
        )}

        {/* Settings Form */}
        <div className="bg-gray-800 rounded-lg p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Incremento por Ciclo 5/3/1
            </label>
            <p className="text-xs text-gray-400 mb-3">
              Cantidad de peso a agregar a cada levantamiento cuando inicies un nuevo ciclo
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                step="0.5"
                value={cycleIncrement531}
                onChange={(e) => setCycleIncrement531(parseFloat(e.target.value))}
                min="0.5"
                max="50"
                className="w-24 bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
              />
              <span className="text-gray-300">kg</span>
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-4">
            <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded bg-[#d6ff43] text-gray-900 font-medium hover:bg-yellow-400 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
