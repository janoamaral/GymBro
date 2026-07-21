## 1. Actualizar spec de la capability

- [x] 1.1 Sincronizar `openspec/specs/workout-day-exercises/spec.md` con el delta de múltiples series del change.

## 2. Extender el endpoint de creación de ejercicios

- [x] 2.1 Actualizar `createExerciseSchema` en `src/app/api/workouts/by-date/[date]/exercises/route.ts` para aceptar `sets` como array obligatorio y deprecar campos planos de set.
- [x] 2.2 Reescribir el handler `POST` para iterar el array de sets, calcular `exerciseOrder` y `setNumber` una sola vez por grupo, y crear todas las filas de `ExerciseSet`.
- [x] 2.3 Cambiar la respuesta del endpoint a `{ sets: [...] }`.
- [x] 2.4 Verificar que el schema `z.array(setInputSchema).min(1)` rechaza sets vacíos o inválidos con 400.

## 3. Corregir el frontend de `/workout/[date]`

- [x] 3.1 Reescribir `handleAddExercise` en `src/app/workout/[date]/page.tsx` para enviar el array completo `exercise.sets` en lugar de solo `firstSet`.
- [x] 3.2 Adaptar la actualización optimista del estado local y del cache para insertar múltiples sets devueltos por el servidor.
- [x] 3.3 Adaptar la rama offline de `handleAddExercise` para generar ids temporales para cada set y encolar el payload con el array completo.

## 4. Verificación

- [x] 4.1 Ejecutar `npx tsc --noEmit` y corregir errores de TypeScript.
- [x] 4.2 Verificar por revisión de código que `/workout/[date]` envía 3 sets y renderiza "3 sets" en la tarjeta.
- [x] 4.3 Verificar por revisión de código que la rama offline encola 2 sets y el flush los sincroniza.
