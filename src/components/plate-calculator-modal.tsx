'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import {
  calculatePlateLoadPerSide,
  suggestPlatesPerSide,
  standardPlatesForUnit,
} from '@/lib/training/plate-calculator';

interface PlateCalculatorModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly targetWeight: number;
  readonly unit: 'kg' | 'lb';
  readonly availablePlatesKg?: number[];
}

export function PlateCalculatorModal({
  isOpen,
  onClose,
  targetWeight,
  unit,
  availablePlatesKg,
}: PlateCalculatorModalProps) {
  const [barbellWeight, setBarbellWeight] = useState(unit === 'kg' ? 20 : 45);
  const [disabledPlateIndices, setDisabledPlateIndices] = useState<Set<number>>(new Set());

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

  const originalPlates = useMemo(() => {
    if (!result) {
      return [];
    }

    return suggestPlatesPerSide(
      Number(result.perSide),
      unit,
      unit === 'kg' ? availablePlatesKg : undefined,
    );
  }, [result, unit, availablePlatesKg]);

  const allStandardPlates = useMemo(() => {
    return unit === 'kg' ? (availablePlatesKg ?? standardPlatesForUnit(unit)) : standardPlatesForUnit(unit);
  }, [unit, availablePlatesKg]);

  const disabledPlateValues = useMemo(() => {
    const values: number[] = [];
    disabledPlateIndices.forEach((idx) => {
      if (idx < originalPlates.length) {
        values.push(originalPlates[idx]);
      }
    });
    return values;
  }, [disabledPlateIndices, originalPlates]);

  const effectiveAvailablePlates = useMemo(() => {
    if (disabledPlateValues.length === 0) {
      return allStandardPlates;
    }

    return allStandardPlates.filter((plate) => !disabledPlateValues.includes(plate));
  }, [allStandardPlates, disabledPlateValues]);

  const replacementPlates = useMemo(() => {
    if (disabledPlateValues.length === 0) {
      return [];
    }

    const totalDisabledWeight = disabledPlateValues.reduce((sum, val) => sum + val, 0);

    const availableForReplacement = effectiveAvailablePlates.length > 0
      ? effectiveAvailablePlates
      : (unit === 'kg' ? standardPlatesForUnit(unit) : standardPlatesForUnit(unit));

    const maxPlateForReplacement = availableForReplacement
      .filter((p) => totalDisabledWeight % p === 0)
      .sort((a, b) => b - a)[0] ?? availableForReplacement[0];

    const cappedPlates = availableForReplacement.filter((p) => p <= maxPlateForReplacement);

    return suggestPlatesPerSide(
      totalDisabledWeight,
      unit,
      cappedPlates,
    );
  }, [disabledPlateValues, unit, effectiveAvailablePlates]);

  const togglePlate = (index: number) => {
    setDisabledPlateIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const plateBadges = useMemo(() => {
    const counts = new Map<number, number>();

    return originalPlates.map((plate, index) => {
      const nextCount = (counts.get(plate) ?? 0) + 1;
      counts.set(plate, nextCount);

      return {
        plate,
        key: `original-${plate}-${index}`,
        disabled: disabledPlateIndices.has(index),
        index,
        isOriginal: true,
      };
    });
  }, [originalPlates, disabledPlateIndices]);

  const replacementBadges = useMemo(() => {
    const counts = new Map<number, number>();

    return replacementPlates.map((plate, index) => {
      const nextCount = (counts.get(plate) ?? 0) + 1;
      counts.set(plate, nextCount);

      return {
        plate,
        key: `replacement-${plate}-${index}`,
        disabled: false,
        index,
        isOriginal: false,
      };
    });
  }, [replacementPlates]);

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

            {(plateBadges.length > 0 || replacementBadges.length > 0) && (
              <div className="panel-soft rounded-xl p-3">
                <p className="text-sm font-medium text-gray-300 mb-2">Plate Suggestion</p>
                <div className="flex flex-wrap gap-2">
                  {plateBadges.map(({ plate, key, disabled, index }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => togglePlate(index)}
                      className={`px-3 py-1 rounded font-semibold transition-opacity ${
                        disabled
                          ? 'bg-gray-600 text-gray-400 line-through opacity-50 cursor-pointer'
                          : 'bg-[#d6ff43] text-gray-900'
                      }`}
                    >
                      {plate}
                    </button>
                  ))}
                  {replacementBadges.map(({ plate, key }) => (
                    <span
                      key={key}
                      className="bg-blue-400 text-gray-900 px-3 py-1 rounded font-semibold"
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
            onClick={() => {
              setDisabledPlateIndices(new Set());
              onClose();
            }}
            className="btn-dark px-4 py-2"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
