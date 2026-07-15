## Context

La página `src/app/workout/[date]/page.tsx` agrupa los sets de todas las `WorkoutSession` del día (filtradas por `startedAt` en el día UTC) en `ExerciseGroup[]`. Hoy las mutaciones sobre el día son: reordenar (`PATCH /api/workouts/by-date/[date]` con `orderedExerciseIds`), reprogramar y eliminar el workout entero. Existe `POST /api/workouts/[sessionId]/sets` que crea un set (y crea el `Exercise` si llega solo `exerciseName`), pero exige `repsTarget`, `targetWeight` y `unit` obligatorios y no crea la sesión.

Sesión-día: una sesión pertenece a un día solo por su `startedAt` (default `now()`). No hay FK fecha↔sesión. Para agregar un ejercicio a un día hay que garantizar una sesión con `startedAt` en ese día y crearle al menos una serie. Para eliminar un ejercicio del día hay que borrar todas sus series en las sesiones de ese día.

Offline queue (`src/lib/offline-queue.ts`) ya encola `set`/`deleteWorkout`/`reorder`/`reschedule` y se flushea al reconectar. El cache local (`getCachedWorkoutDay`/`cacheWorkoutDay`/`patchCachedSetsInDay`) alimenta el render inmediato.

## Goals / Non-Goals

**Goals:**
- Permitir agregar un ejercicio (con su primera serie) a un día de workout existente, sin tocar el plan semanal.
- Permitir eliminar un único ejercicio de un día sin borrar las demás series ni la sesión.
- Operar offline con la misma UX que el resto de las mutaciones de workout.
- Mantener la coherencia gráfica (componentes `Modal`, `ConfirmDialog`, `btn-dark`/`btn-accent`, `panel-soft`, iconos `lucide-react`).

**Non-Goals:**
- Reescribir el plan wizard ni la generación de plan.
- Edición inline del nombre del ejercicio desde la tarjeta del día.
- Reasignar sets de un ejercicio a otro.
- Cambios de schema en Prisma.

## Decisions

### 1. Endpoints por día en lugar de por sesión
**Decisión:** exponer `POST` y `DELETE` bajo `/api/workouts/by-date/[date]/exercises` (con `exerciseId` en query/body para el DELETE) que operen atómicamente sobre **todas** las sesiones del día.

- **Alternativa A:** reusar `POST /api/workouts/[sessionId]/sets` + crear la sesión manualmente desde el cliente. Descartada: el cliente no sabe qué sesión usar cuando hay varias (hoy múltiples sesiones por día son posibles tras `generate-plan`), y acopla la UI a una decisión de routing de sesiones que pertenece al servidor.
- **Alternativa B:** extender `POST /api/workouts` para aceptar `startedAt`. Descartada: resuelve solo la creación de sesión, no el borrado por ejercicio, y deja la semántica de "agregar ejercicio a un día" repartida en dos endpoints.

#### POST /api/workouts/by-date/[date]/exercises
- Body (zod): `{ exerciseId?: string, exerciseName?: string (1..120), repsTarget: int 1..100, targetWeight: number > 0, unit: 'kg'|'lb', liftId?: 'SQ'|'DL'|'BP', durationSeconds?: int, distanceMeters?: number }`.
- Resuelve la sesión del día: reusa la primera sesión del usuario cuyo `startedAt` cae en ese día UTC; si no existe, crea una con `startedAt` al inicio (UTC 00:00) de ese día `date` y `title` derivado (ej. `Workout YYYY-MM-DD`).
- `exerciseId`: si viene null y `exerciseName` viene, crea `Exercise` (userId, name, preferredUnit=unit), reusando `db.exercise.findFirst` por nombre+userId antes de crear (mismo patrón que `plan/generate`).
- Calcula `exerciseOrder` con `MAX(exerciseOrder)+1` sobre las series del día (guard compatibilidad `isExerciseOrderUnsupported`), `setNumber` como `count(sets de la sesión)+1`.
- Transacción `$transaction`: create set + (condicional) create exercise + (condicional) create session, evitando medias escrituras.
- Respuesta `201 { set, exercise }`.

#### DELETE /api/workouts/by-date/[date]/exercises?exerciseId=ID
- Borra en `$transaction` todos los `ExerciseSet` con `exerciseId` en las sesiones del día del usuario.
- Si tras el borrado una sesión queda sin series, se deja intacta (la sesión puede servir de marcador de día reprogramado); no se elimina la sesión para preservar `reschedule` metadata. Re-chequeo: si la sesión queda vacía y no tiene reschedule, igual se conserva Non-Goal limpiar sesiones vacías.
- Respuesta `200 { deleted: <n> }`.

### 2. Cliente: reuso de ExerciseFormModal
- El botón **+** abre `ExerciseFormModal` con `accessoryOnly` (modo custom, sin 531), produciendo un `Exercise` con `sets[0]`. Se toman `name`, `unit`, y la primera serie (`reps`/`weight`/`durationSeconds`/`distanceMeters`/`bodyweight`) para armar el `POST`.
- `bodyweight` → `targetWeight: 0` (convención existente en `POST /sets` y en el edit modal).
- Tras `201`: insertar el set en el estado `sessions`/`exercises`, llamar `cacheWorkoutDay` para pisar el cache del día, y refluir `groupSetsByExercise`.
- Botón **eliminar** por tarjeta: abre `ConfirmDialog` ya usado por el borrado de workout. La confirmación dispara el `DELETE`; en éxito se quita el grupo del estado y se reescribe el cache del día.

### 3. Integración offline
- Nuevas helpers en `offline-queue.ts`: `enqueueAddExerciseMutation(date, payload)` y `enqueueDeleteExerciseMutation(date, exerciseId)`, con `flushOfflineMutationQueue` que las replique contra los nuevos endpoints.
- En `catch`: si `!navigator.onLine || err instanceof TypeError` se encola y se aplica la mutación sobre el cache local (`patchCachedSetsInDay` con el set creado provisional / removido), con el mismo patrón de mensajes de `syncError` ya presente en la página de detalle.
- No se persisten IDs inventados en offline para el set agregado: se genera un id temporal `crypto.randomUUID()` con prefijo `local-` igual al convenido por `acknowledgeSetMutationFields` (revisar convención existente antes de implementar).

### 4. Botón eliminar en la tarjeta
- Posición: absoluto `bottom-3 left-3`, espejo del `GripVertical` que vive en `bottom-3 right-3`. Icono `Trash2` (ya importado), tamaño `h-9 w-9` y clases del pill de iconos (`set-icon-btn--base/--next` si aplica, sino mismo bloque visual del grip).
- `stopPropagation` del click para no disparar `handleExerciseOpen`; el card ya tiene `pr-12` — se agrega `pl-12` para que el título no choque con el botón abajo a la izquierda cuando el nombre es largo.
- Disabled mientras la mutación de borrado está en curso.

## Risks / Trade-offs

- **[Múltiples sesiones por día]** El POST reusa "la primera sesión del día" (orden `createdAt asc`, como el GET). Es transparente para `groupSetsByExercise` que aplana por `exerciseId`. Si el usuario tuviera sesiones con `reschedule` en el mismo día, el nuevo set cae en la sessionId original, no en la movida — coherente con que `reschedule` solo mueve `startedAt`. → Mitigación: operar el POST sobre sesiones cuyo `startedAt` coincide con *exactamente* `date` (UTC day). Documentado en el handler.
- **[exerciseOrder en schemas viejos]** El handler reproduce el guard `isExerciseOrderUnsupported` y cae a `exerciseOrder: 0` si el campo no existe, igual que `plan/generate`/`reorder`.
- **[Sesión vacía tras DELETE]** Queda una `WorkoutSession` sin sets. Non-Goal Cleanup; no rompe nada (el GET la devuelve, el render "No hay ejercicios" ya cubre el caso `exercises.length === 0`).
- **[Offline IDs temporales]** Riesgo de colisión / doble creación al reconectar. → Mitigación: idempotencia por `exerciseName+date` en el flush del add (server resuelve find-or-create por nombre+userId); el delete encolado se aplica por `exerciseId` real.
- **[Audit / conflicto de orden]** Agregar un ejercicio mientras hay reorden pendiente puede pisar el `exerciseOrder`. → Mitigación: el PATCH de reorder está debounceado y `MAX(exerciseOrder)+1` ya reconcilia tras pisar; el reorder reescribe todo el orden.

## Migration Plan

- Despliegue backend-first: nuevos endpoints no rompen nada (solo rutas nuevas).
- Frontend: botón + y botón eliminar aparecen en `/workout/[date]`; sin feature flag (cambio aislado, retrocompatible).
- Rollback: revertir frontend quita los botones; los endpoints pueden quedarse sin uso. No hay migración de DB.

## Open Questions

- ¿Convención exacta de IDs temporales en `offline-queue.ts` para sets creados offline? (definir al implementar, revisar `acknowledgeSetMutationFields`).
- ¿`title` de la sesión creada en el POST? Propuesta: `Workout ${date}` (localizable luego). Se acepta any review.