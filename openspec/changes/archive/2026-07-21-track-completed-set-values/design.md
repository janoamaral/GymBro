## Context

La app actualmente modela `ExerciseSet` con `repsTarget`/`targetWeight` (objetivo) y un `repsDone Int?` ya presente pero prácticamente sólo usado vía flujo AMRAP. No existe `weightDone`. La página `src/app/workout/[date]/[exerciseId]/page.tsx` renderiza una card por set con: header (Serie N + línea `formatSetLine`), pill Completado/Pendiente, sección RIR/Feeling (`renderFeelingSection`), badges de feeling y rest, e icon-buttons Editar y Calculadora. La sync offline se hace a través de `enqueueSetMutation` / `patchCachedSetsInDay` / `acknowledgeSetMutationFields` en `src/lib/offline-queue.ts`. El endpoint `PATCH /api/workouts/[sessionId]/sets/[setId]` ya acepta `repsDone` con schema Zod.

Stakeholder: futuro "virtual coach" que necesita datos reales (no targets) para análisis de progreso.

## Goals / Non-Goals

**Goals:**
- Persistir reps y peso realmente ejecutados por set (`repsDone`, `weightDone`).
- Prefill automático desde el target al completar el set, sin fricción.
- Editar valores completados vía modal accesible desde la card.
- Mostrar los valores completados de forma compacta en la card.
- Mantener compat offline (cola + cache).

**Non-Goals:**
- Captura de `durationDone`/`distanceDone` para sets de tiempo/distancia (queda como follow-up; el modal solo cubre reps/peso).
- Cálculo de e1rm o volumen basado en valores completados (feature de análisis posterior).
- Backfill de sets históricos (los null quedan null).
- Cambios en el wizard de plan o en la página del día.

## Decisions

### Decision 1: Reutilizar `repsDone` + agregar `weightDone Decimal?`
`repsDone` ya está en el schema prisma y en el PATCH Zod. Agregar `weightDone Decimal?` como columna nullable es aditivo y consistente con `targetWeight Decimal?`. No se renombra ni se mueve `repsDone`.
- *Alternativa descartada*: tabla separada `SetCompletion`. Suma join innecesario y rompe offline queue que vive por setId.

### Decision 2: Prefill al completar (`handleToggleDone`), no con botón aparte
El prefill se dispara en `handleToggleDone` cuando `nextIsDone=true` y `set.repsDone === null` (y/o `weightDone === null`). Se cálcula el payload combinado `{ isDone: true, repsDone, weightDone }` y se reenvía al schedule existente. Así el "marcar como completado" exige cero pasos extra; el modal queda opcional para ajustar después.
- *Alternativa descartada*: requerir abrir el modal al completar. Fricciona el flujo de un workout real.

### Decision 3: Modal dedicado en la card, junto a RIR/Feeling
Nuevo botón "Completado" (ícono `ClipboardCheck` de lucide) visible solo cuando `set.isDone`. Abre un `Modal` (mismo componente `src/components/ui/modal.tsx`) con dos inputs numéricos (reps, peso) y toggle de unidad reutilizando el patrón del modal de edición existente. Aceptar hace PATCH `{ repsDone, weightDone }` siguiendo el mismo try/catch + offline fallback que `handleSaveSetEdit`.

### Decision 4: Label compacto "Hecho: N × W kg" debajo de la línea de reps
Línea de una sola fila, estilo badge pequeño, se renderiza solo si `repsDone !== null && weightDone !== null`. Si `repsDone === repsTarget && weightDone === targetWeight` usa estilo "neutro" (mismo color que el target); si difiere aplica un acento sutil (border accent). Se ubica en la card debajo del header de reps, arriba del bloque RIR.

### Decision 5: Extender el PATCH Zod schema + `data` del update con `weightDone`
```ts
weightDone: z.number().min(0).nullable().optional(),
```
Y agregar `weightDone: payload.weightDone` al `data` de `db.exerciseSet.update`. Sin RpeLog, sin e1rm.

### Decision 6: Reutilizar el flujo offline existente
El `enqueueSetMutation` ya acepta un `updates` parcial con campos arbitrarios; el `acknowledgeSetMutationFields` ya filtra por nombre de campo. Simplemente se pasa `{ repsDone, weightDone }` en los puntos de mutación y se agrega `repsDone`/`weightDone` a la lista de campos acknowledgeados tras la confirmación de PATCH. No se toca la firma de `offline-queue.ts`.

### Decision 7: Migración prisma aditiva
Nueva migration `add_weight_done_to_exercise_set` con `ALTER TABLE "ExerciseSet" ADD COLUMN "weightDone" DECIMAL NULL;`. No hay data migration.

## Risks / Trade-offs

- **Riesgo**: Sets antiguos con `repsDone` populado por AMRAP ahora también se muestran en el label "Hecho:". → *Mitigación*: Si `weightDone === null` el label no se renderiza (AMRAP no setea weightDone). Esto cubre la mayoría; los AMRAP con weightDone ausente no muestran label espurio.
- **Riesgo**: Conflicto conceptual "repsDone" entre AMRAP legacy y completados genéricos. → *Mitigación*: Misma columna con mismo significado semántico (reps ejecutadas). El flujo AMRAP sigue funcionando idéntico (`repsDone` vía opción logAsAmrap ya soportada).
- **Riesgo**: El PATCH combine `isDone` + `repsDone` + `weightDone` en una sola mutation y la cola offline serialice correctamente. → *Mitigación*: `enqueueSetMutation` mergea updates por setId; al desmarcar y re-marcar offline, los campos se sobrescriben consistentemente.
- **Trade-off**: No cubrir `durationDone`/`distanceDone` deja sets de tiempo/distancia sin label "Hecho:". Aceptado; follow-up posterior cuando el coach necesite esos datos.

## Migration Plan

1. Generar y aplicar migración prisma: `npx prisma migrate dev --name add_weight_done_to_exercise_set`.
2. Deploy backend (schema + endpoint PATCH extendido). Compatibilidad: clientes viejos siguen sin enviar `weightDone` (campo queda null).
3. Deploy frontend. Sin migrations de runtime; cache IndexedDB no cambia estructura (los campos viajan como parte del Set serializado).
4. Rollback: revertir el frontend; el campo `weightDone` queda nullable y no activo. Para rollback de DB, una migration `DROP COLUMN` es segura porque ningún código viejo lo lee.