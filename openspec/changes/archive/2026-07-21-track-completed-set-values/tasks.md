## 1. Schema y migración

- [x] 1.1 Agregar `weightDone Decimal?` al modelo `ExerciseSet` en `prisma/schema.prisma`
- [x] 1.2 Generar y aplicar migración `add_weight_done_to_exercise_set` con `prisma migrate dev`
- [x] 1.3 Regenerar el Prisma client y verificar que el campo exista en `src/generated/prisma`

## 2. API: PATCH de set

- [ ] 2.1 Extender `updateSetSchema` en `src/app/api/workouts/[sessionId]/sets/[setId]/route.ts` con `weightDone: z.number().min(0).nullable().optional()`
- [ ] 2.2 Agregar `weightDone: payload.weightDone` al `data` de `db.exerciseSet.update`
- [ ] 2.3 Verificar manualmente con curl/Postman: PATCH con `weightDone` válido, `null`, e inválido (espera 400)

## 3. UI: interfaz `Set` y fetch

- [x] 3.1 Extender la interfaz `Set` en `src/app/workout/[date]/[exerciseId]/page.tsx` con `repsDone: number | null` y `weightDone: number | null`
- [x] 3.2 Verificar que el GET `/api/workouts/by-date/[date]` ya devuelve estos campos (Prisma los incluye por defecto); si no, agregar al `select`/`include`
- [x] 3.3 Extender `SetServerSnapshot` y `confirmedSetValuesRef` tracking para incluir `repsDone`/`weightDone`

## 4. UI: prefill al completar

- [x] 4.1 En `handleToggleDone`, cuando `nextIsDone === true` y `set.repsDone === null`, calcular `nextRepsDone = set.repsTarget` y `nextWeightDone = Number(set.targetWeight)` (no sobrescribir si ya existen)
- [x] 4.2 Actualizar el `setSets` map para incluir `repsDone`/`weightDone` cuando aplique
- [x] 4.3 Actualizar el `patchCachedSetsInDay` con `repsDone`/`weightDone` cuando aplique
- [x] 4.4 Combinar el payload de `scheduleSetDoneUpdate` (o enviar un `scheduleSetMetricsUpdate` adicional) con `repsDone`/`weightDone`; verificar que `acknowledgeSetMutationFields` los acepte como campos válidos

## 5. UI: modal de valores completados

- [x] 5.1 Agregar estado: `editingCompletedSetId`, `completedReps`, `completedWeight`, `completedUnit`, `isCompletedSaving`, `completedError`
- [x] 5.2 Implementar `handleOpenCompleted(set)` que prefilla con `set.repsDone ?? set.repsTarget` y `set.weightDone ?? Number(set.targetWeight)`, y `set.unit`
- [x] 5.3 Implementar `handleSaveCompleted` que valida (reps int 0-1000, weight >= 0), hace PATCH `{ repsDone, weightDone, unit }`, actualiza estado local + cache + offline fallback siguiendo el patrón de `handleSaveSetEdit`
- [x] 5.4 Renderizar el modal con `Modal` de `ui/modal`: inputs numéricos de reps y peso, toggle de unidad (kg/lb) reutilizando helper de conversión, botón Aceptar/Cancelar
- [x] 5.5 Agregar botón "Completado" (ícono `ClipboardCheck` de lucide-react) en la card visible solo cuando `set.isDone === true`, junto a los icon-buttons existentes (Pencil/Calculator) o en el bloque de RIR/Feeling

## 6. UI: label compacto de completado

- [x] 6.1 Implementar `formatCompletedLine(set)` que devuelve `Hecho: {repsDone} × {weightDone} {unit}` (o `BW` si weightDone === 0)
- [x] 6.2 Renderizar el label en la card solo cuando `set.repsDone !== null && set.weightDone !== null`, debajo de la línea `formatSetLine`, con estilo neutro cuando coincide con target y sutilmente acentuado cuando difiere
- [x] 6.3 Quitar el label de la sección "feeling badge" del legacy si había duplicación visual con el badge de feeling; asegurarse que el resto de badges (rest, feeling) conviven sin clutter

## 7. Verificación

- [x] 7.1 Correr `pnpm lint` (eslint) y `pnpm typecheck` (si disponible) y arreglar warnings nuevos
- [ ] 7.2 Smoke test manual: crear una sesión, marcar set como completado (espera prefill), abrir modal, editar valores, aceptar (espera persistencia), recargar (espera label de Hecho con valores nuevos)
- [ ] 7.3 Smoke test offline: desconectar red, completar y editar modal, reconectar, verificar sync vía cola
- [ ] 7.4 Verificar que sets de tiempo/distancia no rompen (no muestran el label de Hecho porque weightDone queda null)