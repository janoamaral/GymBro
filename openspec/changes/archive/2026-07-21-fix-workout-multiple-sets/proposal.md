## Why

En `/workout/[date]`, cuando el usuario presiona el botón **+** y agrega un ejercicio con más de una serie, el modal de carga envía múltiples sets pero la página y el API solo procesan la primera serie. Esto genera pérdida de datos de entrenamiento y una UX inconsistente.

## What Changes

- Corregir `src/app/workout/[date]/page.tsx` para enviar todas las series del ejercicio al endpoint de creación.
- Extender `POST /api/workouts/by-date/[date]/exercises` para aceptar un array de sets y crear una serie por cada entrada.
- Ajustar la sincronización offline (`enqueueAddExerciseMutation`) y el cache local para soportar múltiples sets.
- Actualizar el spec `workout-day-exercises` con escenarios que cubran la creación de varias series en una sola operación.

## Capabilities

### New Capabilities
<!-- Ninguna -->

### Modified Capabilities

- `workout-day-exercises`: El requisito de "Agregar ejercicio a un día de workout" debe soportar múltiples series en una sola llamada, no solo una primera serie.

## Impact

- Frontend: `src/app/workout/[date]/page.tsx` y posiblemente `src/lib/offline-queue.ts`.
- Backend: `src/app/api/workouts/by-date/[date]/exercises/route.ts`.
- Specs: `openspec/specs/workout-day-exercises/spec.md`.
- No cambios en APIs públicas ni en la base de datos (solo se crean más filas de `ExerciseSet`).
