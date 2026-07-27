## ADDED Requirements

### Requirement: Cálculo de propuesta recalculada al abrir la sesión del día
El sistema SHALL calcular una propuesta recalculada para una sesión 5/3/1 cuando el usuario abre `/workout/[date]` en la fecha de ejecución de esa sesión, leyendo el plan original persistido y el historial reciente del mismo `liftId` (últimas 3 semanas o ~9 sesiones). El cálculo SHALL ser una función pura en `src/lib/training/531.ts` invocada desde un endpoint `GET /api/workout/[date]/recalc`.

#### Scenario: Sin historial suficiente
- **WHEN** el lift de la sesión tiene menos de 3 sesiones de historial en las últimas 3 semanas
- **THEN** el sistema retorna una propuesta con `level = "Sin cambios"` y `reasons = ["historial insuficiente"]`, y el plan original se mantiene como propuesta

#### Scenario: Cálculo con historial válido
- **WHEN** el lift de la sesión tiene al menos 3 sesiones de historial y el usuario abre `/workout/[date]` en la fecha de ejecución
- **THEN** el sistema calcula `repPerformance` (media de `repsDone / repsTarget` en sets no cancelados), `rirTrend` (media de `rir` en top sets), `feelingTrend` (media de `feelingScore` de sesión) y `blockFatigue` (sets cancelados por `cancelReasonCode=1` / sets totales del bloque), y los usa para clasificar el nivel

#### Scenario: Datos incompletos no bloquean la sesión
- **WHEN** faltan campos opcionales (`rir`, `feelingScore`, `e1rm`) en parte del historial
- **THEN** el sistema usa los campos disponibles, omite los ausentes del promedio, y nunca lanza error; la propuesta degrada gracefulmente hacia `Sin cambios`

### Requirement: Clasificación del nivel de ajuste
El sistema SHALL clasificar la propuesta en uno de cuatro niveles: `Sin cambios`, `Leve`, `Moderado`, `Agresivo`, aplicando las reglas de negocio (mejorando / justo / por debajo / fatiga alta) con umbrales definidos en un objeto `RECALC_THRESHOLDS` exportado y ajustable sin tocar la lógica.

#### Scenario: Usuario viene mejorando estable
- **WHEN** `repPerformance > 1.05` AND `rirTrend ≥ 2` AND `blockFatigue < 0.1` AND `feelingTrend ≥ 3`
- **THEN** el nivel es `Leve`: subir `targetWeight` del top set 2.5%, mantener `repsTarget`

#### Scenario: Usuario viene mejorando claro
- **WHEN** `repPerformance > 1.15` OR (`rirTrend ≥ 3` sostenido en las últimas 3 sesiones) AND fatiga baja
- **THEN** el nivel es `Moderado`: subir `targetWeight` 5%, mantener reps objetivo

#### Scenario: Usuario sobrecumpliendo con fatiga baja
- **WHEN** `repPerformance > 1.15` AND `rirTrend ≥ 3` AND `blockFatigue < 0.1` AND `feelingTrend ≥ 4`
- **THEN** el nivel es `Agresivo`: subir `targetWeight` 5% y sumar 1 rep al objetivo del set AMRAP

#### Scenario: Usuario viene cumpliendo justo
- **WHEN** `|repPerformance - 1| < 0.05` AND `rirTrend` entre 1 y 3 AND `feelingTrend ≥ 3` AND `blockFatigue < 0.1`
- **THEN** el nivel es `Sin cambios` y los `suggestedSets` son idénticos al original

#### Scenario: Usuario viene por debajo del objetivo
- **WHEN** `repPerformance < 0.9`
- **THEN** el nivel reduce `targetWeight` 5% y baja 1 set de backoff; el `level` se etiqueta `Por debajo`

#### Scenario: Fatiga alta del bloque
- **WHEN** `blockFatigue > 0.25` OR `feelingTrend < 2`
- **THEN** el nivel prioriza reducir volumen (quitar 1 set de backoff/accesorio) antes que intensidad, sin progresión de peso; el `level` se etiqueta `Conservador`

### Requirement: Motivo legible del ajuste
Cada propuesta recalculada con nivel distinto de `Sin cambios` SHALL incluir un `reasons: string[]` legible que enumere las señales usadas (p.ej. "repPerformance 1.18 sobre objetivo", "rir medio 3.2", "fatiga del bloque 0.30"). Las propuestas `Sin cambios` SHALL incluir el motivo por el cual no se sugiere cambio (p.ej. "historial insuficiente", "cumplimiento justo").

#### Scenario: Propuesta con ajuste incluye señales
- **WHEN** el nivel es `Moderado` por `repPerformance 1.18` y `rir medio 3.2`
- **THEN** `reasons` contiene al menos dos entradas que mencionan los valores de `repPerformance` y `rirTrend`

#### Scenario: Propuesta Sin cambios explica por qué
- **WHEN** el nivel es `Sin cambios` por historial insuficiente
- **THEN** `reasons` contiene `"historial insuficiente"` (o equivalente legible)

### Requirement: Conservación del plan original
El sistema MUST persistir el plan generado por `generate531Session`/`plan531Week` como **plan original** inmutable por sesión. Al aceptar una propuesta recalculada, el sistema SHALL conservar el snapshot original (sesión espejo con `title` sufijo ` (original)` o `ExerciseSet` marcado `isOriginalPlan=true`) de forma que siempre pueda recuperarse la versión base.

#### Scenario: Plan original persistido al crear el ciclo
- **WHEN** se ejecuta `POST /api/plan/new-cycle` (o `/monthly`, `/generate`)
- **THEN** los `ExerciseSet` resultantes quedan persistidos con `WorkoutSession.recalculationVersion = null` y son el plan original

#### Scenario: Aceptar propuesta no destruye el original
- **WHEN** el usuario acepta una propuesta recalculada y se sobrescriben `targetWeight`/`repsTarget`/`percentage` en los `ExerciseSet` de la sesión
- **THEN** el snapshot original previo queda conservado (sesión espejo o `ExerciseSet` con `isOriginalPlan=true`) y es recuperable

### Requirement: Recálculo funciona offline
El sistema SHALL permitir calcular la propuesta recalculada con los sets disponibles en el cache offline (`getCachedWorkoutDay`) cuando no hay conexión, y el resultado se sincronizará al reconectar igual que el resto de las mutaciones del día.

#### Scenario: Recálculo offline
- **WHEN** el usuario abre `/workout/[date]` sin conexión y hay sets cacheados de las últimas 3 semanas para el lift
- **THEN** el cliente calcula la propuesta con los datos cacheados y muestra el banner; al reconectar, el endpoint de recálculo refresca la propuesta con datos de servidor

### Requirement: Esquema mínimo y no destructivo
La extensión del esquema MUST ser aditiva y nullable/default: `WorkoutSession.recalculationVersion Int?` (null = sin propuesta, 0 = original elegida, 1 = recalc elegida), `WorkoutSession.recalcReason String?`, y `ExerciseSet.isOriginalPlan Boolean @default(false)`. No se renombran ni eliminan campos existentes.

#### Scenario: Migración aditiva
- **WHEN** se aplica la migración
- **THEN** todas las sesiones existentes quedan con `recalculationVersion = null`, `recalcReason = null`, y los `ExerciseSet` existentes con `isOriginalPlan = false`, sin pérdida de datos