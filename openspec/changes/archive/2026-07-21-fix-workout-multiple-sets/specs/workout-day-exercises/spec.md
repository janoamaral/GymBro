## MODIFIED Requirements

### Requirement: Agregar ejercicio a un día de workout
El sistema SHALL permitir agregar un ejercicio nuevo a un día de workout existente desde la página `/workout/[date]`, creando todas las series configuradas por el usuario en una sola operación sin regenerar el plan semanal.

#### Scenario: Agregar ejercicio con una sola serie
- **WHEN** el usuario abre el modal de agregar ejercicio desde el botón **+** al pie de la lista de `/workout/[date]`, completa nombre, unidad y una sola serie, y confirma
- **THEN** el sistema crea una serie de ese ejercicio en una sesión existente del día (reusando la primera por `createdAt asc`), respeta `exerciseOrder = MAX(exerciseOrder del día)+1`, y renderiza la nueva tarjeta del ejercicio sin recargar la página

#### Scenario: Agregar ejercicio con múltiples series
- **WHEN** el usuario abre el modal, completa nombre, unidad y 3 series distintas (o iguales), y confirma
- **THEN** el sistema crea las 3 series del mismo ejercicio en una sola llamada, les asigna `setNumber` secuencial y el mismo `exerciseOrder`, y la tarjeta muestra "3 sets"

#### Scenario: Agregar ejercicio cuando no existe sesión en el día
- **WHEN** no existe ninguna `WorkoutSession` cuyo `startedAt` caiga en el día `date` y el usuario agrega un ejercicio con 2 series
- **THEN** el sistema crea una sesión con `startedAt` al inicio (UTC 00:00:00) de ese `date`, le asigna ambas series al ejercicio, y la tarjeta aparece en `/workout/[date]` mostrando "2 sets"

#### Scenario: Reuso de Exercise por nombre
- **WHEN** el usuario agrega un ejercicio con un `exerciseName` que ya existe para el usuario (mismo `name + userId`)
- **THEN** el sistema reutiliza el `Exercise` existente y no crea un duplicado

#### Scenario: Persistencia offline de múltiples series
- **WHEN** se agrega un ejercicio con 2 series sin conexión y la petición falla por `!navigator.onLine` o `TypeError`
- **THEN** el sistema encola la mutación con ambas series, inserta 2 sets temporales en el cache local del día con ids temporales distintos, y muestra un mensaje de sincronización pendiente
