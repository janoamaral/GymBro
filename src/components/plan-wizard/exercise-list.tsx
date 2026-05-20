'use client';

import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { Exercise } from './exercise-form-modal';

const TOUCH_DRAG_THRESHOLD_PX = 12;

interface ExerciseListProps {
  readonly exercises: Exercise[];
  readonly onEdit: (index: number) => void;
  readonly onDelete: (index: number) => void;
  readonly onReorder: (fromIndex: number, toIndex: number) => void;
}

export function ExerciseList({
  exercises,
  onEdit,
  onDelete,
  onReorder,
}: Readonly<ExerciseListProps>) {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const touchStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const touchActiveIndexRef = useRef<number | null>(null);
  const touchDraggingRef = useRef(false);
  const dragOriginPointRef = useRef<{ x: number; y: number } | null>(null);
  const dragRafIdRef = useRef<number | null>(null);
  const pendingDragPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (dragRafIdRef.current !== null) {
        globalThis.window.cancelAnimationFrame(dragRafIdRef.current);
      }
    };
  }, []);

  const resetDragState = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
    setDragOffset({ x: 0, y: 0 });
    touchStartPointRef.current = null;
    touchActiveIndexRef.current = null;
    touchDraggingRef.current = false;
    dragOriginPointRef.current = null;
    pendingDragPointRef.current = null;
    if (dragRafIdRef.current !== null) {
      globalThis.window.cancelAnimationFrame(dragRafIdRef.current);
      dragRafIdRef.current = null;
    }
  };

  const flushDragOffset = () => {
    const point = pendingDragPointRef.current;
    const origin = dragOriginPointRef.current;

    dragRafIdRef.current = null;

    if (!point || !origin) {
      return;
    }

    setDragOffset({
      x: point.x - origin.x,
      y: point.y - origin.y,
    });
  };

  const updateDragOffset = (clientX: number, clientY: number) => {
    const origin = dragOriginPointRef.current;
    if (!origin) {
      return;
    }

    pendingDragPointRef.current = { x: clientX, y: clientY };

    if (dragRafIdRef.current !== null) {
      return;
    }

    dragRafIdRef.current = globalThis.window.requestAnimationFrame(flushDragOffset);
  };

  const indexFromTouchPoint = (x: number, y: number, excludeIndex?: number): number | null => {
    const elements = document.elementsFromPoint(x, y);

    for (const element of elements) {
      const card = element.closest('[data-plan-exercise-index]') as HTMLElement | null;
      const indexValue = card?.dataset.planExerciseIndex;

      if (!indexValue) {
        continue;
      }

      const parsedIndex = Number.parseInt(indexValue, 10);
      if (!Number.isInteger(parsedIndex)) {
        continue;
      }

      if (excludeIndex !== undefined && parsedIndex === excludeIndex) {
        continue;
      }

      return parsedIndex;
    }

    return null;
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>, index: number) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    touchStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    dragOriginPointRef.current = { x: touch.clientX, y: touch.clientY };
    touchActiveIndexRef.current = index;
    touchDraggingRef.current = false;
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    const activeIndex = touchActiveIndexRef.current;
    const touch = event.touches[0];
    const start = touchStartPointRef.current;

    if (activeIndex === null || !touch || !start) {
      return;
    }

    const deltaX = Math.abs(touch.clientX - start.x);
    const deltaY = Math.abs(touch.clientY - start.y);
    const movedEnough = deltaX > TOUCH_DRAG_THRESHOLD_PX || deltaY > TOUCH_DRAG_THRESHOLD_PX;

    if (!touchDraggingRef.current && movedEnough) {
      touchDraggingRef.current = true;
      setDraggingIndex(activeIndex);
      setDragOverIndex(activeIndex);
    }

    if (!touchDraggingRef.current) {
      return;
    }

    event.preventDefault();
    updateDragOffset(touch.clientX, touch.clientY);

    const targetIndex = indexFromTouchPoint(touch.clientX, touch.clientY, activeIndex);
    if (targetIndex !== null && targetIndex !== dragOverIndex) {
      setDragOverIndex(targetIndex);
    }
  };

  const handleTouchEnd = () => {
    const activeIndex = touchActiveIndexRef.current;
    const targetIndex = dragOverIndex;
    const isDragging = touchDraggingRef.current;

    if (isDragging && activeIndex !== null && targetIndex !== null && activeIndex !== targetIndex) {
      onReorder(activeIndex, targetIndex);
    }

    resetDragState();
  };

  const formatNon531Summary = (exercise: Exercise) => {
    const sets = exercise.sets ??
      (exercise.weight && exercise.reps ? [{ weight: exercise.weight, reps: exercise.reps }] : []);

    if (sets.length === 0) {
      return 'Sin sets definidos';
    }

    const allIdentical = sets.every(
      (set) => set.weight === sets[0].weight && set.reps === sets[0].reps
    );

    if (allIdentical) {
      return `${sets.length} x ${sets[0].reps} reps @ ${sets[0].weight} ${exercise.unit}`;
    }

    return sets
      .map((set, index) => `S${index + 1}: ${set.reps} @ ${set.weight} ${exercise.unit}`)
      .join(' • ');
  };

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
          key={`${exercise.id ?? exercise.name}-${exercise.method}-${exercise.liftId ?? 'custom'}-${exercise.unit}-${exercise.oneRm ?? 'n/a'}-${exercise.sets?.length ?? 0}`}
          data-plan-exercise-index={index}
          role="button"
          tabIndex={0}
          aria-label={`Reordenar ${exercise.name}`}
          draggable
          onDragStart={(event) => {
            setDraggingIndex(index);
            setDragOverIndex(index);
            dragOriginPointRef.current = { x: event.clientX, y: event.clientY };
            setDragOffset({ x: 0, y: 0 });
          }}
          onDrag={(event) => {
            if (event.clientX === 0 && event.clientY === 0) {
              return;
            }

            updateDragOffset(event.clientX, event.clientY);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (dragOverIndex !== index) {
              setDragOverIndex(index);
            }
          }}
          onDrop={() => {
            if (draggingIndex === null || draggingIndex === index) {
              return;
            }

            onReorder(draggingIndex, index);
            setDraggingIndex(null);
            setDragOverIndex(null);
          }}
          onDragEnd={() => {
            resetDragState();
          }}
          onTouchStart={(event) => handleTouchStart(event, index)}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={resetDragState}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' && index > 0) {
              event.preventDefault();
              onReorder(index, index - 1);
            }

            if (event.key === 'ArrowDown' && index < exercises.length - 1) {
              event.preventDefault();
              onReorder(index, index + 1);
            }
          }}
          className={`panel-soft flex items-center justify-between rounded-xl p-4 transition-all cursor-grab active:cursor-grabbing ${dragOverIndex === index ? 'ring-2 ring-sky-400/60 plan-drag-card--target' : ''} ${draggingIndex === index ? 'opacity-85 plan-drag-card--active transition-none' : ''}`}
          style={
            draggingIndex === index
              ? { transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` }
              : undefined
          }
        >
          <div>
            <p className="font-semibold text-white">{exercise.name}</p>
            <p className="text-sm text-gray-400">
              {exercise.method === '531' 
                ? `1RM: ${exercise.oneRm} ${exercise.unit}`
                : formatNon531Summary(exercise)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(index)}
              className="btn-dark p-2"
              aria-label="Edit exercise"
            >
              <Edit2 size={18} className="text-blue-400" />
            </button>
            <button
              onClick={() => onDelete(index)}
              className="btn-dark p-2"
              aria-label="Delete exercise"
            >
              <Trash2 size={18} className="text-red-400" />
            </button>
          </div>
        </div>
      ))}

      <style jsx>{`
        .plan-drag-card--active {
          z-index: 10;
          box-shadow: 0 18px 44px rgba(5, 12, 20, 0.4);
          will-change: transform;
        }

        .plan-drag-card--target {
          animation: plan-drag-target 500ms ease-in-out infinite;
        }

        @keyframes plan-drag-target {
          0% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1px);
          }
          100% {
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
