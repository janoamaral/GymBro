## Context

La app genera ciclos 5/3/1 con `plan531Week` → `generate531Session` (src/lib/training/531.ts) y persiste `WorkoutSession` + `ExerciseSet` (prisma/schema.prisma) con `repsTarget`, `targetWeight`, `percentage`, `isAmrap`, `rir`, `rpe`, `setFeelingScore`, `feelingScore`/`feelingNotes` por sesión. Es decir: **ya capturamos las señales** que alimentan la autorregulación (reps objetivo vs realizadas, RIR, e1rm por set, feeling de sesión). Lo que falta es (1) conservar el plan original de forma inmutable al recalcular, (2) un motor de recálculo que lea esas señales y (3) UX que presente la propuesta y registre la elección.

El flujo de planificación vive en `POST /api/plan/new-cycle`, `/api/plan/monthly`, `/api/plan/generate` (todos llaman a `generate531Session`). La vista de ejecución es `src/app/workout/[date]/page.tsx` (lista de ejercicios del día) y `src/app/workout/[date]/[exerciseId]/page.tsx` (detalle del ejercicio con sets). El cache offline se maneja vía `offline-queue.ts` (`cacheWorkoutDay`, `getCachedWorkoutDay`, `hasPendingMutationsForDay`).

## Goals / Non-Goals

**Goals:**
- Conservar el plan original de cada sesión 5/3/1 de forma inmutable.
- Calcular, al abrir una sesión en su fecha de ejecución, una propuesta recalculada a partir de las últimas 3 semanas de historial + fatiga del bloque.
- Clasificar la propuesta en 4 niveles (Sin cambios / Leve / Moderado / Agresivo) y generar un motivo legible.
- Presentar original vs propuesta en `/workout/[date]` y dejar al usuario elegir.
- Vincular la sesión ejecutada a la versión elegida y guardar ambas versiones + motivo para trazabilidad.
- Funciona offline (recálculo local con los sets cacheados) y sincroniza la elección cuando reconecta.

**Non-Goals:**
- Reescribir `generate531Session` ni el `WEEK_MATRIX` estándar 5/3/1.
- Cambiar el flujo de creación de cycle base (`NewCycleModal`, `/api/plan/new-cycle`).
- Diagnóstico médico de fatiga; sólo usamos señales ya capturadas.
- Recomendaciones automáticas sin confirmación del usuario.
- Soportar lifts fuera de SQ/DL/BP (el dominio 5/3/1 actual).

## Decisions

### D1. Plan original = snapshot persistido, no tabla aparte
Al generar el ciclo guardamos los `ExerciseSet` como hoy. Al decidir sobre una propuesta persistimos snapshots JSON en `WorkoutSession.originalPlan` y `WorkoutSession.recalculatedPlan`; `recalculationVersion` registra cuál se ejecutó (`null` = pendiente, `0` = original, `1` = recalculado). El snapshot original se toma antes de mutar sets.

**Alternativa descartada:** clonar sets o crear una sesión espejo. Ambas opciones contaminan lectores existentes (calendario, exportación y analytics) y exigen filtros transversales.

### D2. Recálculo puro (sin estado), en servidor, cacheable
`recalculate531Session(input)` en `src/lib/training/531.ts`: función pura que toma `{ originalSets, historySets, feelingHistory }` y devuelve `{ level, suggestedSets, reasons }`. Se invoca desde `GET /api/workouts/by-date/[date]/recalc`, que arma el historial (últimas 3 semanas de `ExerciseSet` del mismo `liftId`). El cliente cachea el resultado por día con `cacheResource`.

**Alternativa descartada:** recálculo en cliente. Duplica la lógica de acceso a historial y se desincroniza del servidor. El endpoint servidor reusa las queries existentes de `/api/workouts`.

### D3. Régimen de reglas — escalas simples, no ML
Señales por lift (de los últimos 21 días o ~9 sesiones):
- `repPerformance` = media de `repsDone / repsTarget` en sets no cancelados del lift.
- `rirTrend` = media de `rir` reportado en top sets.
- `feelingTrend` = media de `feelingScore` de sesión.
- `blockFatigue` =_sets cancelados por cansancio (`cancelReasonCode=1`) en el bloque actual / sets totales.

Nivel:
- `Sin cambios`: |repPerformance - 1| < 0.05 AND rirTrend en [1,3] AND feelingTrend ≥ 3 AND blockFatigue < 0.1.
- `Leve`: mejorando estable (repPerformance > 1.05, rir ≥ 2, fatiga baja) → +2.5% peso en top set, reps objetivo igual.
- `Moderado`: mejorando claro (repPerformance > 1.15 o rir ≥ 3 sostenido) → +5% peso, mantener reps.
- `Agresivo`: sobrecumpliendo + fatiga baja → +5% y subir 1 rep objetivo a AMRAP.
- Rendimiento por debajo (`repPerformance < 0.9`) → nivel `Moderado`, reducir `targetWeight` 5% y bajar 1 set de backoff.
- Fatiga alta (`blockFatigue > 0.25` o `feelingTrend < 2`) → nivel `Agresivo`, priorizar reducción de volumen; si no hay backoff, reducir 5% la carga.

Las constantes (umbrales 0.05/0.1/0.25, porcentajes 2.5/5) viven en un objeto `RECALC_THRESHOLDS` exportado, ajustables sin tocar la lógica — son el knob de calibración del mundo real que no vamos a adivinar.

### D4. UX — banner no modal, diffs inline
En `/workout/[date]`, al haber propuesta activa con nivel > `Sin cambios`, se renderiza un banner colapsable arriba de la lista de ejercicios: "Sugerencia: Moderado — subir 2.5kg en Squat". Al expandir, filas `original → sugerido` por set con delta destacado (color accent `#d6ff43` para subida, `gray-400` para bajada). Dos botones: **Aceptar** y **Seguir plan original**. No es modal: el usuario puede scrollear los ejercicios mientras decide. Si nivel = `Sin cambios`, no se renderiza nada (anti-spam).

Diferencias relevadas: `targetWeight`, `repsTarget`, número de sets, intensidad (suma de percentages), volumen (tonnage).

### D5. Persistencia de la elección
POST `/api/workouts/by-date/[date]/recalc/accept` con `{ accepted: boolean }`. En ambos casos guarda `originalPlan`, `recalculatedPlan` y `recalcReason`. Si acepta, reescribe los sets activos y fija `recalculationVersion = 1`; si rechaza, conserva los sets y fija `recalculationVersion = 0`.

**Sobre offline:** la elección se encola en la offline queue existente (mismo patrón que `offline-workout-warmup.tsx`); el session header del día muestra pending-sync como ya pasa con `syncError`.

### D6. Esquema — extensión mínima nullable
```prisma
model WorkoutSession {
  // ... existente
  recalculationVersion Int?    // null=sin propuesta, 0=original elegida, 1=recalc elegida
  recalcReason          String?
  originalPlan          Json?
  recalculatedPlan      Json?
}
model ExerciseSet {
  // ... existente
  isOriginalPlan        Boolean @default(false)  // true = snapshot conservado
}
```
Sin migración destructiva: ambos nullable/default. Cero renombrados.

## Risks / Trade-offs

- [Recálculo sugiere cambios irrelevantes y spammea la UI] → Nivel `Sin cambios` no renderiza banner; los umbrales son conservadores y viven en `RECALC_THRESHOLDS` ajustables.
- [Snapshots JSON aumentan el tamaño de `WorkoutSession`] → sólo se guardan al decidir y contienen los campos necesarios para trazabilidad; se eliminan por cascade con la sesión.
- [Recálculo desde datos incompletos arroja basura] → si < 3 sesiones de historial del lift, endpoint retorna `{ level: "Sin cambios", reasons: ["historial insuficiente"] }`.
- [Conflicto con cola offline al aceptar] → POST `/accept` encola igual que cualquier mutación; si hay pending mutations para el día, el recálculo se rehace tras sync.
- [Umbrales mal calibrados] → riesgo real en cualquier algoritmo de autorregulación; mitigado por knob central y por que el usuario manda.

## Migration Plan

1. Migraciones Prisma aditivas (`recalculationVersion`, `recalcReason`, `originalPlan`, `recalculatedPlan`) — sin backfill.
2. Deploy backend: nuevas funciones en `531.ts` + endpoints `/recalc` y `/recalc/accept`. Backward compat: sin propuesta, la app se comporta idéntica.
3. Deploy frontend: banner condicional; sin propuesta, UI idéntica.
4. Rollback: revertir frontend esconde el banner; revertir backend deja endpoints 404 y la app sigue funcionando. Las columnas nullable no afectan nada.

## Open Questions

- ¿Umbral mínimo de historial = 3 sesiones del lift, o 2 si hay e1rm reportado? Abierto a calibración.
- ¿Cache del resultado de recálculo invalidado al cambiar sets del día? Sí, por `cacheWorkoutDay` key — ya invalida al mutar.

## Implementation Notes

- Se reemplaza la sesión espejo propuesta inicialmente por `WorkoutSession.originalPlan Json?` y `WorkoutSession.recalculatedPlan Json?`. Duplicar sesiones contaminaba calendario, exportación y analytics; los snapshots JSON conservan ambas versiones sin alterar los lectores existentes. `ExerciseSet.isOriginalPlan` se mantiene por compatibilidad con la migración ya publicada, pero no participa en el flujo nuevo.
- Los niveles visibles quedan limitados a los cuatro requeridos: `Sin cambios`, `Leve`, `Moderado`, `Agresivo`. La dirección (progresión, rendimiento bajo o fatiga) vive en `reasons`.
