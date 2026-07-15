## 1. Backend: agregar ejercicio a un día

- [x] 1.1 Crear `src/app/api/workouts/by-date/[date]/exercises/route.ts` con handler `POST`
- [x] 1.2 Validar `date` con `parseIsoDateParts`; 400 si formato inválido (reusar helper del route `by-date/[date]`)
- [x] 1.3 Zod schema del body: `exerciseId?`, `exerciseName? (1..120)`, `repsTarget (1..100)`, `targetWeight (>0)`, `unit`, `liftId?`, `durationSeconds?`, `distanceMeters?`
- [x] 1.4 Resolver sesión del día: `findFirst` por `startedAt` en el día UTC (`createdAt asc`); si no existe, crear con `startedAt` = UTC 00:00 de `date` y `title` `Workout ${date}`
- [x] 1.5 `exerciseId`: si ausente, find-or-create `Exercise` por `name + userId` (patrón de `plan/generate`)
- [x] 1.6 `$transaction`: crear `ExerciseSet` con `exerciseOrder = MAX+1` (guard `isExerciseOrderUnsupported` → fallback `0`), `setNumber = count(sets sesión)+1`, `targetWeight` (0 si bodyweight), `durationSeconds`/`distanceMeters` según medida
- [x] 1.7 Responder `201 { set, exercise }` con errores `SESSION_NOT_FOUND`/`EXERCISE_REQUIRED`/`INVALID_PAYLOAD`/`FAILED_TO_CREATE_EXERCISE`

## 2. Backend: eliminar ejercicio de un día

- [x] 2.1 Agregar handler `DELETE` al mismo `route.ts` que reciba `exerciseId` por query string
- [x] 2.2 Buscar todas las sesiones del día del usuario; `exerciseSet.deleteMany({ where: { sessionId: { in }, exerciseId } })` en `$transaction`
- [x] 2.3 No eliminar sesiones vacías (preservar `reschedule`); responder `200 { deleted: <n> }`
- [x] 2.4 Errores: `INVALID_DATE_FORMAT`, `MISSING_EXERCISE_ID`, `FAILED_TO_DELETE_EXERCISE`

## 3. Offline queue

- [x] 3.1 Revisar `src/lib/offline-queue.ts` y la convención de IDs temporales en `acknowledgeSetMutationFields`
- [x] 3.2 Agregar `enqueueAddExerciseMutation(date, payload)` y `enqueueDeleteExerciseMutation(date, exerciseId)`
- [x] 3.3 Extender `flushOfflineMutationQueue` para replicarlas contra los nuevos endpoints (idempotencia por `name+date` en add, por `exerciseId` en delete)
- [ ] 3.4 Casos de prueba mínimos: add offline → reconexión crea set real; delete offline → reconexión borra sets

## 4. Frontend: agregar ejercicio

- [x] 4.1 En `src/app/workout/[date]/page.tsx`, agregar estado `showAddExerciseModal`
- [x] 4.2 Botón **+** al pie de la lista de ejercicios (y bajo la vista de lista vacía), clases `btn-dark`/estilos de la app
- [x] 4.3 Renderizar `<ExerciseFormModal accessoryOnly>` y mapear el `Exercise` resultante al payload del `POST` (`bodyweight` → `targetWeight: 0`, `reps`/`durationSeconds`/`distanceMeters` según `measure`)
- [x] 4.4 Handler `handleAddExercise`: fetch POST, en `201` insertar la serie en `sessions`/`exercises` (refluir `groupSetsByExercise`) y reescribir `cacheWorkoutDay(date, ...)`
- [x] 4.5 Catch offline: encolar mutación, insertar set temporal en estado/cache, mostrar `syncError` con el mismo patrón que el detail page

## 5. Frontend: eliminar ejercicio

- [x] 5.1 Estado `deletingExerciseId` y `showDeleteExerciseConfirm`
- [x] 5.2 Botón eliminar por tarjeta: absoluto `bottom-3 left-3`, `h-9 w-9`, icono `Trash2`, clases espejo del `GripVertical`, `stopPropagation` del click, disabled durante la mutación
- [x] 5.3 Ajustar padding del card (agregar `pl-12`) para que el título no choque con el botón inferior izquierdo
- [x] 5.4 `<ConfirmDialog>` reusado para confirmar borrado del ejercicio
- [x] 5.5 Handler `handleDeleteExercise`: fetch DELETE, en éxito remover el grupo del estado y reescribir cache del día
- [x] 5.6 Catch offline: encolar, remover del estado/cache, mensaje de `syncError`

## 6. Verificación

- [x] 6.1 `npm run lint` y `npm run typecheck` (o el comando del repo) sin errores
- [ ] 6.2 Smoke manual: agregar ejercicio a un día con sesión previa y a un día sin sesión; eliminar un ejercicio; cancelar la eliminación
- [ ] 6.3 Smoke offline: agregar y eliminar con `navigator.onLine=false` y reconectar, verificar sincronización
- [x] 6.4 Verificar coherencia gráfica: botones + y eliminar respetan `btn-dark`/`btn-accent`/`panel-soft` e iconos `lucide-react`