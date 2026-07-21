## Why

La app hoy solo persiste los valores *objetivo* de un set (repsTarget, targetWeight). Sin registrar lo realmente ejecutado no hay forma de auditar progreso real ni de alimentar al futuro virtual coach. Necesitamos capturar reps/peso completados por set, con prefill desde el target para no friccionar el flujo, y mostrarlos sin clutter.

## What Changes

- Se introducen campos de valores *completados* por set: `repsDone` (ya existe en el schema) y un nuevo `weightDone` (Decimal nullable) para el peso realmente levantado.
- Al marcar un set como completado (`handleToggleDone` → `isDone: true`), los campos `repsDone` y `weightDone` se precargan automáticamente con `repsTarget` y `targetWeight` si están vacíos, persistidos vía la API existente `PATCH /api/workouts/[sessionId]/sets/[setId]`.
- Se agrega un botón visible en la card del set (junto al bloque de RIR/Feeling) que abre un modal para cargar/editar los valores completados. El modal abre prefillado con los valores target (o los ya completados si existen).
- Al aceptar el modal, `repsDone` y `weightDone` se persisten (PATCH de set) y se actualiza el estado local + cache offline.
- Se muestra un label compacto con los valores completados en la card, solo cuando difieren del target o siempre que existan (sin clutter: una línea tipo `Hecho: 3 × 80 kg`).
- La cola offline (`enqueueSetMutation`) reutiliza el path existente; los campos `repsDone`/`weightDone` ya son admisibles como mutación de set.
- La API PATCH de set extiende su schema Zod para aceptar `weightDone` (number, min 0, nullable).

## Capabilities

### New Capabilities
- `completed-set-values`: Registro y edición de valores completados (reps y peso) por set, con prefill desde el target al completar, modal de captura, persistencia offline/online y visualización compacta en la card.

### Modified Capabilities
<!-- No modifica requisitos de specs existentes. `repsDone` ya está en el modelo ExerciseSet y en el schema del PATCH de set; solo se extiende con `weightDone`. -->

## Impact

- **Prisma schema**: agregar `weightDone Decimal?` a `ExerciseSet` + migración. `repsDone` ya existe (`prisma/schema.prisma:88`).
- **API**: `src/app/api/workouts/[sessionId]/sets/[setId]/route.ts` — extender `updateSetSchema` y el `data` del `update` con `weightDone`.
- **UI**: `src/app/workout/[date]/[exerciseId]/page.tsx` — extender interfaz `Set` con `repsDone`/`weightDone`, agregar botón + modal de completados (reutiliza `Modal`), label compacto, integración en `handleToggleDone` para prefill, calling a `scheduleSetDoneUpdate`/`enqueueSetMutation` con `repsDone`/`weightDone`.
- **Offline**: `src/lib/offline-queue.ts` — `acknowledgeSetMutationFields` ya admite campos arbitrarios; sumar `repsDone`/`weightDone` a los ref recognitions en la página. No requiere cambios tipográficos nuevos.
- **Compatibidad**: cambios aditivos; sets viejos con `repsDone`/`weightDone` null se siguen renderizando sin el label de completado.