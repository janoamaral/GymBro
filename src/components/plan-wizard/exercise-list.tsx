'use client';

import { Trash2, Edit2 } from 'lucide-react';
import { Exercise } from './exercise-form-modal';

interface ExerciseListProps {
  exercises: Exercise[];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
}

export function ExerciseList({
  exercises,
  onEdit,
  onDelete,
}: ExerciseListProps) {
  if (exercises.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <p>No exercises added yet. Click the + button to add one.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {exercises.map((exercise, index) => (
        <div
          key={index}
          className="bg-gray-700 rounded p-4 flex items-center justify-between"
        >
          <div>
            <p className="font-semibold text-white">{exercise.name}</p>
            <p className="text-sm text-gray-400">
              {exercise.method === '531' 
                ? `1RM: ${exercise.oneRm} ${exercise.unit}`
                : `${exercise.weight} ${exercise.unit} x ${exercise.reps} reps`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(index)}
              className="p-2 hover:bg-gray-600 rounded transition-colors"
              aria-label="Edit exercise"
            >
              <Edit2 size={18} className="text-blue-400" />
            </button>
            <button
              onClick={() => onDelete(index)}
              className="p-2 hover:bg-gray-600 rounded transition-colors"
              aria-label="Delete exercise"
            >
              <Trash2 size={18} className="text-red-400" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
