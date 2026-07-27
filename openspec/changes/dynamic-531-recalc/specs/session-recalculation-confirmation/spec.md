## ADDED Requirements

### Requirement: Presentación conjunta de plan original y propuesta recalculada
La vista `/workout/[date]` SHALL presentar, cuando exista una propuesta recalculada con nivel distinto de `Sin cambios`, un banner colapsable encima de la lista de ejercicios que muestra el nivel de ajuste y un resumen (`level + resumen`), y al expandirse muestra las diferencias por set entre el plan original y la propuesta.

#### Scenario: Banner visible sólo con nivel > Sin cambios
- **WHEN** existe una propuesta recalculada con nivel `Leve`, `Moderado`, `Agresivo`, `Por debajo` o `Conservador`
- **THEN** la vista `/workout/[date]` renderiza un banner colapsable con el nivel y el resumen, encima de la lista de ejercicios

#### Scenario: Sin banner cuando no hay propuesta
- **WHEN** el nivel de la propuesta es `Sin cambios` o no hay propuesta calculada
- **THEN** lavista `/workout/[date]` no renderiza ningún banner y se comporta idéntica a la versión anterior

### Requirement: Diferencias resaltadas por set
Al expandir el banner, el sistema SHALL mostrar, por cada set del plan, las diferencias entre original y sugerido: `targetWeight` anterior vs sugerido, `repsTarget` anterior vs sugerido, número de sets, intensidad (suma de percentages) y volumen (tonnage). Las subidas se destacan con color accent (`#d6ff43`), las bajadas con `gray-400`; cambios irrelevantes (delta < 1%) no se destacan.

#### Scenario: Diferencias de peso y reps
- **WHEN** la propuesta recalculada sube `targetWeight` de 80 a 82kg y `repsTarget` de 3 a 5 en el set AMRAP
- **THEN** el banner expandido muestra la fila del set con `80 → 82kg` y `3 → 5` destacadas en accent

#### Scenario: Diferencia de número de sets
- **WHEN** la propuesta quita 1 set de backoff (de 5 sets a 4)
- **THEN** el banner expandido muestra la diferencia "−1 set de backoff" y el tonnage total ajustado

### Requirement: Aceptación explícita de la propuesta
El banner SHALL presentar dos botones: **Aceptar** (aplica los valores recalculados a la sesión como plan a ejecutar) y **Seguir plan original** (conserva el plan base). La sesión ejecutada posteriormente queda vinculada a la versión elegida; el usuario no puede ejecutar sets sin haber resuelto el banner si existe una propuesta activa con nivel > `Sin cambios`.

#### Scenario: Usuario acepta la propuesta
- **WHEN** el usuario presiona **Aceptar** en el banner
- **THEN** el sistema envía `POST /api/workout/[date]/recalc/accept { accepted: true }`, actualiza los `ExerciseSet` de la sesión con los valores recalculados, fija `WorkoutSession.recalculationVersion = 1`, conserva el snapshot original, y el banner desaparece

#### Scenario: Usuario rechaza la propuesta
- **WHEN** el usuario presiona **Seguir plan original**
- **THEN** el sistema envía `POST /api/workout/[date]/recalc/accept { accepted: false }`, fija `WorkoutSession.recalculationVersion = 0`, guarda el motivo en `recalcReason` (para rear por qué se rechazó), y el banner desaparece

#### Scenario: Sin banner visible = sin bloqueo
- **WHEN** no hay propuesta activa (nivel `Sin cambios` o no calculada)
- **THEN** el usuario puede ejecutar los sets normalmente sin necesidad de resolver ningún banner

### Requirement: Registro de versión ejecutada y motivo
El sistema SHALL vincular la sesión ejecutada con la versión elegida (`recalculationVersion`) y conservar el motivo (`recalcReason`). Esto permite trazabilidad: plan original, propuesta recalculada y plan efectivamente ejecutado quedan disponibles para análisis posterior.

#### Scenario: Trazabilidad de la versión aceptada
- **WHEN** el usuario acepta y ejecuta la propuesta recalculada
- **THEN** `WorkoutSession.recalculationVersion = 1`, el snapshot original queda persistido, y `recalcReason` tiene el motivo legible

#### Scenario: Trazabilidad de la versión rechazada
- **WHEN** el usuario rechaza pero ejecuta el plan original
- **THEN** `WorkoutSession.recalculationVersion = 0` y `recalcReason` conservael motivo ofrecido por el algoritmo

### Requirement: Sincronización offline de la elección
La elección del usuario (aceptar o rechazar) MUST encolarse en la offline queue cuando no hay conexión, aplicarse optimistamente en la UI, y sincronizarse al reconectar con el mismo patrón y mensaje `syncError` que el resto de las mutaciones de workout.

#### Scenario: Aceptar propuesta estando offline
- **WHEN** el usuario presiona **Aceptar** y la petición falla por `!navigator.onLine`
- **THEN** la mutación se encola, la UI marca la sesión como `recalculationVersion = 1` optimistamente, y al reconectar se envía el POST al servidor

#### Scenario: Rechazar propuesta estando offline
- **WHEN** el usuario presiona **Seguir plan original** sin conexión
- **THEN** la mutación se encola, la UI marca `recalculationVersion = 0` optimistamente, y al reconectar se envía el POST al servidor