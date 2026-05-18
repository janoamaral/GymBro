'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import {
  calculatePlateLoadPerSide,
  suggestPlatesPerSide,
} from '@/lib/training/plate-calculator';

interface PlateCalculatorModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly targetWeight: number;
  readonly unit: 'kg' | 'lb';
}

export function PlateCalculatorModal({
  isOpen,
  onClose,
  targetWeight,
  unit,
}: PlateCalculatorModalProps) {
  const [barbellWeight, setBarbellWeight] = useState(unit === 'kg' ? 20 : 45);
  const result = useMemo(() => {
    if (targetWeight <= barbellWeight) {
      return null;
    }

    return calculatePlateLoadPerSide({
      targetWeight,
      barbellWeight,
      unit,
      roundingMode: 'up',
    });
  }, [targetWeight, barbellWeight, unit]);

  const plates = useMemo(() => {
    if (!result) {
      return [];
    }

    return suggestPlatesPerSide(Number(result.perSide), unit);
  }, [result, unit]);

  const plateBadges = useMemo(() => {
    const counts = new Map<number, number>();

    return plates.map((plate) => {
      const nextCount = (counts.get(plate) ?? 0) + 1;
      counts.set(plate, nextCount);

      return {
        plate,
        key: `${plate}-${nextCount}`,
      };
    });
  }, [plates]);

  const handleBarbellChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number.parseFloat(e.target.value);
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
          <label htmlFor="barbell-weight" className="block text-sm font-medium text-gray-300 mb-2">
            Barbell Weight
          </label>
          <input
            id="barbell-weight"
            type="number"
            step="0.5"
            value={barbellWeight}
            onChange={handleBarbellChange}
            title="Peso de la barra"
            className="field-dark"
          />
        </div>

        {result && (
          <>
            <div className="panel-soft rounded-xl p-3">
              <p className="text-sm text-gray-400">Per Side (exact)</p>
              <p className="text-xl font-bold text-[#d6ff43]">
                {result.perSide} {unit}
              </p>
            </div>

            <div className="panel-soft rounded-xl p-3">
              <p className="text-sm text-gray-400">Per Side (rounded)</p>
              <p className="text-xl font-bold text-[#d6ff43]">
                {result.roundedPerSide} {unit}
              </p>
            </div>

            <div className="panel-soft rounded-xl p-3">
              <p className="text-sm text-gray-400">Total Loaded</p>
              <p className="text-xl font-bold text-white">
                {result.totalFromBarAndPlates} {unit}
              </p>
            </div>

            {plates.length > 0 && (
              <div className="panel-soft rounded-xl p-3">
                <p className="text-sm font-medium text-gray-300 mb-2">Plate Suggestion</p>
                <div className="flex flex-wrap gap-2">
                  {plateBadges.map(({ plate, key }) => (
                    <span
                      key={key}
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
            className="btn-dark px-4 py-2"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
