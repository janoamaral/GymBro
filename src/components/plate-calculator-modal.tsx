'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/modal';
import {
  calculatePlateLoadPerSide,
  suggestPlatesPerSide,
} from '@/lib/training/plate-calculator';

interface PlateCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetWeight: number;
  unit: 'kg' | 'lb';
}

export function PlateCalculatorModal({
  isOpen,
  onClose,
  targetWeight,
  unit,
}: PlateCalculatorModalProps) {
  const [barbellWeight, setBarbellWeight] = useState(unit === 'kg' ? 20 : 45);
  const [result, setResult] = useState<any>(null);
  const [plates, setPlates] = useState<number[]>([]);

  useEffect(() => {
    if (targetWeight > barbellWeight) {
      const calc = calculatePlateLoadPerSide({
        targetWeight,
        barbellWeight,
        unit,
        roundingMode: 'up',
      });
      setResult(calc);

      const suggested = suggestPlatesPerSide(Number(calc.perSide), unit);
      setPlates(suggested);
    }
  }, [targetWeight, barbellWeight, unit]);

  const handleBarbellChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (val > 0) {
      setBarbellWeight(val);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Plate Calculator">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Target Weight: {targetWeight} {unit}
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Barbell Weight
          </label>
          <input
            type="number"
            step="0.5"
            value={barbellWeight}
            onChange={handleBarbellChange}
            className="w-full bg-gray-700 text-white rounded px-3 py-2 border border-gray-600 focus:outline-none focus:border-[#d6ff43]"
          />
        </div>

        {result && (
          <>
            <div className="bg-gray-700 rounded p-3">
              <p className="text-sm text-gray-400">Per Side (exact)</p>
              <p className="text-xl font-bold text-[#d6ff43]">
                {result.perSide} {unit}
              </p>
            </div>

            <div className="bg-gray-700 rounded p-3">
              <p className="text-sm text-gray-400">Per Side (rounded)</p>
              <p className="text-xl font-bold text-[#d6ff43]">
                {result.roundedPerSide} {unit}
              </p>
            </div>

            <div className="bg-gray-700 rounded p-3">
              <p className="text-sm text-gray-400">Total Loaded</p>
              <p className="text-xl font-bold text-white">
                {result.totalFromBarAndPlates} {unit}
              </p>
            </div>

            {plates.length > 0 && (
              <div className="bg-gray-700 rounded p-3">
                <p className="text-sm font-medium text-gray-300 mb-2">Plate Suggestion</p>
                <div className="flex flex-wrap gap-2">
                  {plates.map((plate, idx) => (
                    <span
                      key={idx}
                      className="bg-[#d6ff43] text-gray-900 px-3 py-1 rounded font-semibold"
                    >
                      {plate}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-gray-700 text-white hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
