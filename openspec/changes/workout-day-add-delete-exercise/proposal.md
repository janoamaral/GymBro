## Why

En la página `/workout/[date]` solo es posible abrir, reordenar o eliminar el workout entero. Hoy no existe forma de agregar un ejercicio nuevo a un día ya existente sin regenerar el plan, ni de sacar un único ejercicio sin borrar toda la sesión. ParaRegistrar un ejercicio que se agregó en el momento (o corregir uno que se cargó de más) obliga a operar desde el plan wizard o a eliminar el día completo, perdiendo los sets ya registrados.

## What Changes

- Botón **+** al pie de la lista de ejercicios en `/workout/[date]` que abre un modal para agregar un ejercicio al día (nombre + primera serie, reutilizando `ExerciseFormModal` en modo accessorio).
- Botón **eliminar** por tarjeta de ejercicio, ubicado abajo a la izquierda, debajo del título del ejercicio, con confirmación (`ConfirmDialog`).
- Nuevo endpoint `POST /api/workouts/by-date/[date]/exercises` que crea (o reusa) la sesión del día y agrega una primera serie para el ejercicio, devolviendo el ejercicio agrupado.
- Nuevo endpoint `DELETE /api/workouts/by-date/[date]/exercises?exerciseId=...` que borra todas las series de ese ejercicio en las sesiones del día, de forma atómica.
- Mutaciones encoladas en la **offline queue** cuando no hay conexión, manteniendo la coherencia con el resto del flujo de workouts.
- Actualización optimista del cache del día (`cacheWorkoutDay` / `patchCachedSetsInDay`) tras cada operación.

## Capabilities

### New Capabilities
- `workout-day-exercises`: agrega y elimina ejercicios individuales sobre un día de workout existente, con persistencia server-side, cola offline y actualización optimista del cache local.

### Modified Capabilities
<!-- No existen specs previas en openspec/specs/. -->

## Impact

- **Frontend**: `src/app/workout/[date]/page.tsx` (nuevo estado de modal/agregar, botón +, botón eliminar por tarjeta, handlers de mutación, integración con offline queue).
- **Backend**: nuevos handlers `POST`/`DELETE` en `src/app/api/workouts/by-date/[date]/exercises/route.ts`; reuso de `db.workoutSession` y `db.exerciseSet`.
- **Offline**: `src/lib/offline-queue.ts` (posibles nuevos helpers `enqueueAddExerciseMutation` / `enqueueDeleteExerciseMutation`), `flushOfflineMutationQueue`.
- **UI compartida**: `ExerciseFormModal` y `ConfirmDialog` ya existentes.
- **DB schema**: sin cambios (se reusan `startedAt`, `exerciseOrder`, `Exercise`, `ExerciseSet`).