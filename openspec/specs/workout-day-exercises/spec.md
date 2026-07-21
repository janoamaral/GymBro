# workout-day-exercises

## Purpose

TBD - define the purpose of this capability.

## Requirements

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

### Requirement: Eliminar ejercicio de un día de workout
El sistema SHALL permitir eliminar un único ejercicio de un día de workout, borrando todas sus series en las sesiones de ese día, sin afectar las demás series ni la sesión misma.

#### Scenario: Eliminar un ejercicio con confirmación
- **WHEN** el usuario presiona el botón eliminar en la tarjeta de un ejercicio (abajo a la izquierda, debajo del título) y confirma en el `ConfirmDialog`
- **THEN** el sistema elimina todas las `ExerciseSet` con ese `exerciseId` en las sesiones del día, quita la tarjeta del listado, y persiste el cambio en el servidor

#### Scenario: Sesión queda sin series
- **WHEN** al eliminar un ejercicio la sesión del día queda sin series
- **THEN** el sistema conserva la sesión (sin eliminarla) para preservar su metadata de `reschedule`, y `/workout/[date]` muestra el estado de "No hay ejercicios para este día"

#### Scenario: Cancelar la eliminación
- **WHEN** el usuario presiona el botón eliminar y cancela en el `ConfirmDialog`
- **THEN** no se realiza ninguna mutación y la tarjeta permanece sin cambios

### Requirement: Persistencia y cola offline de las mutaciones de ejercicio del día
Las operaciones de agregar y eliminar ejercicio sobre un día MUST encolarse en la offline queue cuando no hay conexión, aplicarse optimistamente sobre el cache local, y sincronizarse al reconectar, con la misma UX (mensajes de `syncError`) que el resto de las mutaciones de workout.

#### Scenario: Agregar ejercicio estando offline
- **WHEN** se agrega un ejercicio con 2 series y la petición falla por `!navigator.onLine` o `TypeError`
- **THEN** el sistema encola la mutación con ambas series, inserta 2 sets temporales en el cache local del día con ids temporales distintos, y muestra un mensaje de sincronización pendiente

#### Scenario: Eliminar ejercicio estando offline
- **WHEN** se elimina un ejercicio y la petición falla por `!navigator.onLine` o `TypeError`
- **THEN** el sistema encola la mutación por `exerciseId`, remueve el grupo del estado y del cache local, y al reconectar envía el `DELETE` al servidor

### Requirement: Coherencia gráfica de los nuevos controles
Los nuevos botones (agregar ejercicio y eliminar por tarjeta) MUST respetar la coherencia gráfica del resto de la aplicación: reuso de `Modal`/`ConfirmDialog`, clases `btn-dark`/`btn-accent`/`panel-soft`, e iconos de `lucide-react`.

#### Scenario: Botón agregar ejercicio
- **WHEN** se renderiza `/workout/[date]`
- **THEN** existe un botón **+** al pie de la lista de ejercicios (o bajo la lista vacía) que abre el modal de agregar ejercicio, usando las clases y estilos del resto de la app

#### Scenario: Botón eliminar en la tarjeta
- **WHEN** se renderiza una tarjeta de ejercicio
- **THEN** existe un botón eliminar posicionado absoluto en la esquina inferior izquierda, debajo del título, espejo visual del control de reorden (`GripVertical`) que vive en la esquina inferior derecha, y su click no dispara la apertura del ejercicio
