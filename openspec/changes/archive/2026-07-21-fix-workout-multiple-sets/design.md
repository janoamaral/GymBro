## Context

La página `/workout/[date]` usa `ExerciseFormModal` para capturar uno o más sets. El modal ya produce un array `sets` en el objeto `Exercise`, pero `handleAddExercise` en `src/app/workout/[date]/page.tsx` solo consume `exercise.sets[0]` y envía un payload plano. El endpoint `POST /api/workouts/by-date/[date]/exercises` también crea una sola fila. Como resultado, al confirmar un ejercicio con 3 o 4 sets solo se persiste y renderiza el primero.

## Goals / Non-Goals

**Goals:**
- Que el endpoint de creación acepte y persista múltiples sets de un mismo ejercicio en una sola llamada.
- Que el frontend envíe el array completo y renderice todas las series devueltas.
- Que el cache local y la cola offline reflejen el mismo grupo de sets.
- Actualizar el spec `workout-day-exercises` con escenarios de múltiples series.

**Non-Goals:**
- Cambiar la UI del modal ni el flujo de edición de sets individuales.
- Modificar la base de datos o agregar dependencias externas.
- Soportar múltiples ejercicios en una sola llamada; solo se amplía a múltiples sets del mismo ejercicio.

## Decisions

1. **Payload: array de sets en el POST**
   - El body enviará `sets: [{ repsTarget?, targetWeight, unit, durationSeconds?, distanceMeters? }, ...]` junto con `exerciseName` y `unit` común.
   - Se mantiene el campo `unit` a nivel de ejercicio y se replica en cada set para compatibilidad con el modelo actual.
   - Alternativa: un endpoint separado por set. Descartada porque generaría N requests y peor UX offline.

2. **Respuesta del API: array de sets creados**
   - El endpoint devolverá `{ sets: [...] }` en lugar de `{ set: ... }`.
   - El frontend actualizará el estado local insertando todo el array en la sesión activa.
   - Alternativa: devolver un solo objeto. Descartada porque el frontend necesita todos los ids para tracking.

3. **Orden de las series**
   - Se respetará el orden del array recibido usando `setNumber` secuencial y `exerciseOrder` único para el grupo.
   - Esto mantiene la visualización consistente con la que el usuario configuró en el modal.

4. **Offline queue**
   - `enqueueAddExerciseMutation` ya acepta un payload de ejercicio; se extiende para que el procesamiento de la cola repita el mismo POST con el array completo.
   - En la ruta offline se generarán ids temporales para todos los sets, no solo para el primero.

## Risks / Trade-offs

- **Cambio de contrato del POST**: si hay otros callers que aún envían el payload antiguo, fallarán con 400.
  - Mitigación: auditar usos de `/api/workouts/by-date/${date}/exercises` en el frontend. Solo se usa desde `/workout/[date]`. Se actualiza junto con el API.
- **Offline + reconciliación**: al reconectar, el servidor puede devolver ids reales que reemplazan a los temporales.
  - Mitigación: el cache local ya se refresca en background; los sets temporales se reemplazarán cuando el fetch traiga la versión del servidor.
- **Validación de sets vacíos o inválidos**: el modal valida antes de enviar, pero el endpoint debe revalidar el array.
  - Mitigación: agregar validación de Zod sobre el array (`z.array(...).min(1)`) y rechazar con 400 si hay datos inválidos.

## Migration Plan

1. Actualizar spec `workout-day-exercises`.
2. Extender el schema y el POST del endpoint.
3. Actualizar `handleAddExercise` y la ruta offline en el frontend.
4. Verificar que el cache local y el estado local muestren N sets.
5. Ejecutar un flujo manual: agregar un ejercicio con 3 sets y confirmar que se renderizan 3.

## Open Questions

- ¿Se prefiere mantener compatibilidad con el payload antiguo (un solo set) o se fuerza el array? Se opta por forzar el array para simplificar el código y reducir deuda.
