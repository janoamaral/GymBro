## ADDED Requirements

### Requirement: Cada set admite valores completados de reps y peso
El sistema SHALL almacenar por cada `ExerciseSet` los valores efectivamente ejecutados: `repsDone` (reps completadas) y `weightDone` (peso levantado), ambos nullable. Estos campos son independientes de los target (`repsTarget`, `targetWeight`) y persisten en la base de datos.

#### Scenario: Set creado sin valores completados
- **WHEN** se crea un set nuevo desde el wizard de plan
- **THEN** `repsDone` y `weightDone` quedan en `null` hasta que el usuario los complete

#### Scenario: Set con valores completados persistidos
- **WHEN** el usuario confirma el modal de valores completados con reps=3 y peso=80
- **THEN** el set queda en la base con `repsDone=3` y `weightDone=80`

### Requirement: Completar un set precarga los valores completados desde el target
El sistema SHALL, al marcar un set como completado (`isDone: true`) por primera vez, precargar `repsDone` con `repsTarget` y `weightDone` con `targetWeight` si esos campos eran null. El usuario puede posteriormente editarlos.

#### Scenario: Marcar set pendiente como completado
- **WHEN** el usuario marca como completado un set con target 3 reps × 80 kg y `repsDone`/`weightDone` en null
- **THEN** el sistema setea `repsDone=3` y `weightDone=80` y los persiste vía PATCH `/api/workouts/[sessionId]/sets/[setId]`

#### Scenario: Des-marcar y re-marcar no resetea los valores completados
- **WHEN** el usuario desmarca un set ya completado y lo vuelve a marcar
- **THEN** el sistema NO sobrescribe `repsDone`/`weightDone` existentes con el target

### Requirement: La card del set expone un botón para abrir el modal de valores completados
El sistema SHALL mostrar un botón visible en la card del set, en el bloque junto a RIR/Feeling, que abre un modal para cargar/editar los valores completados (reps y peso). El botón se habilita solo cuando el set está marcado como completado.

#### Scenario: Botón visible en set completado
- **WHEN** el set está marcado como completado
- **THEN** la card muestra un botón "Completado" (icono) que abre el modal

#### Scenario: Botón ausente en set pendiente
- **WHEN** el set no está marcado como completado
- **THEN** la card NO muestra el botón de valores completados

### Requirement: El modal de valores completados abre prefillado
El sistema SHALL abrir el modal con los campos `repsDone` y `weightDone` prefillados: si ya existen valores completados, usa esos; si no, usa los valores target por defecto. El usuario puede modificarlos antes de aceptar.

#### Scenario: Modal abre con valores target cuando no hay completados
- **WHEN** el usuario abre el modal de un set con target 5 reps × 60 kg y sin valores completados previos
- **THEN** los campos del modal muestran 5 y 60 respectivamente

#### Scenario: Modal abre con valores completados previos cuando existen
- **WHEN** el usuario abre el modal de un set con `repsDone=4` y `weightDone=70`
- **THEN** los campos muestran 4 y 70, editables

#### Scenario: Validación del modal
- **WHEN** el usuario intenta aceptar con reps vacío, no numérico, o < 0, o peso < 0
- **THEN** el modal muestra error de validación y no acepta

### Requirement: Aceptar el modal persiste los valores completados
El sistema SHALL, al aceptar el modal, actualizar `repsDone` y `weightDone` del set vía PATCH al endpoint existente, actualizar el estado local y la cache offline del día.

#### Scenario: Accept online
- **WHEN** el usuario acepta el modal estando online
- **THEN** el frontend hace PATCH `/api/workouts/[sessionId]/sets/[setId]` con `{ repsDone, weightDone }`, actualiza el estado local y la cache del día

#### Scenario: Accept offline
- **WHEN** el usuario acepta el modal estando offline o la request falla por red
- **THEN** el frontend encola la mutación con `enqueueSetMutation` para sincronizar luego y actualiza estado local + cache

### Requirement: La API PATCH de set acepta weightDone
El endpoint `PATCH /api/workouts/[sessionId]/sets/[setId]` SHALL aceptar `weightDone` (number, min 0, nullable) junto a `repsDone` ya existente, y persistirlo en el `ExerciseSet`.

#### Scenario: PATCH con weightDone válido
- **WHEN** el cliente envía `{ "weightDone": 82.5 }` al endpoint
- **THEN** el set queda con `weightDone=82.5` y se devuelve el set actualizado

#### Scenario: PATCH con weightDone null
- **WHEN** el cliente envía `{ "weightDone": null }`
- **THEN** el set queda con `weightDone=null`

#### Scenario: PATCH con weightDone inválido
- **WHEN** el cliente envía `{ "weightDone": -5 }`
- **THEN** el endpoint responde 400 con `INVALID_PAYLOAD`

### Requirement: La card muestra un label compacto con los valores completados
El sistema SHALL mostrar en la card del set un label compacto de una línea con los valores completados cuando existen, sin duplicar visualmente los target ya mostrados. El label evita clutter: aparece solo si `repsDone !== null` (o `weightDone !== null`), y se diferencia del target solo si difiere.

#### Scenario: Label ausente cuando no hay valores completados
- **WHEN** el set tiene `repsDone=null` y `weightDone=null`
- **THEN** la card NO muestra el label de completado

#### Scenario: Label muestra valores iguales al target
- **WHEN** el set tiene `repsDone=3` y `weightDone=80` igual al target
- **THEN** la card muestra un label tipo `Hecho: 3 × 80 kg`

#### Scenario: Label destaca diferencia con el target
- **WHEN** el set tiene target 3 × 80 pero `repsDone=4` y `weightDone=85`
- **THEN** la card muestra el label de completado y los valores difieren del target visible