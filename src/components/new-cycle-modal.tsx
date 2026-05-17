'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';

interface Profile {
  liftId: string;
  cycleNumber: number;
  oneRm: number;
  unit: string;
}

interface NewCycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (startDate: string) => void;
}

export function NewCycleModal({
  isOpen,
  onClose,
  onStart,
}: NewCycleModalProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [startDate, setStartDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchProfiles();
      // Set default start date to next Monday
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const dayOfWeek = tomorrow.getDay();
      const daysToMonday = (dayOfWeek === 0 ? 1 : 8 - dayOfWeek);
      const nextMonday = new Date(tomorrow);
      nextMonday.setDate(nextMonday.getDate() + daysToMonday);
      setStartDate(nextMonday.toISOString().split('T')[0]);
    }
  }, [isOpen]);

  const fetchProfiles = async () => {
    try {
      const res = await fetch('/api/training/531/profile');
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch (err) {
      console.error('Failed to fetch profiles:', err);
      setError('Failed to load profiles');
    }
  };

  const handleStart = async () => {
    if (!startDate) {
      setError('Please select a start date');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/plan/new-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Failed to start new cycle');
      }

      onStart(startDate);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Iniciar Nuevo Ciclo">
      <div className="space-y-4">
        {profiles.length > 0 ? (
          <div className="bg-gray-700 rounded p-3 space-y-2">
            <p className="text-sm font-medium text-gray-300">Current Cycle Info:</p>
            {profiles.map((profile) => (
              <div key={profile.liftId} className="text-sm text-gray-300">
                <span className="font-semibold">{profile.liftId}</span>: Cycle {profile.cycleNumber}, 1RM {profile.oneRm} {profile.unit}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No 5/3/1 profiles found. Please create a profile first.</p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Start Date for New Cycle
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
          />
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded p-2 text-red-200 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end pt-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleStart}
            disabled={loading || profiles.length === 0}
            className="px-4 py-2 rounded bg-[#d6ff43] text-gray-900 font-medium hover:bg-yellow-400 transition-colors disabled:opacity-50"
          >
            {loading ? 'Iniciando...' : 'Iniciar Nuevo Ciclo'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
