## Why

Los usuarios necesitan una forma de indicar que un ejercicio planificado no se realizó, distinguiendo entre una eliminación definitiva (por ejemplo, un error de carga) y una cancelación puntual por cansancio, falta de tiempo u otro motivo. Registrar el motivo con un valor numérico permite que el futuro coach virtual analice patrones y dé consejos personalizados.

## What Changes

- Agregar una acción **Cancelar ejercicio** en cada card de ejercicio de la ruta `/workout/[date]`.
- Mostrar un **modal de confirmación** que pida confirmar la cancelación y seleccionar el motivo.
- Los motivos disponibles serán: **Cansancio**, **Falta de tiempo** y **Otro**, cada uno con un **valor numérico fijo**.
- Agregar un flag en la **estructura de datos del ejercicio/set** para persistir el estado cancelado y su motivo.
- Sincronizar la cancelación con el backend y con la **cola offline** para que funcione sin conexión.
- Visualizar en la card cuando un ejercicio fue cancelado (por ejemplo, con un indicador sutil) sin romper el diseño actual.

## Capabilities

### New Capabilities
- `cancel-workout-exercise`: Permitir cancelar un ejercicio desde la lista de ejercicios de un día, solicitando confirmación y motivo, y persistir el estado cancelado junto con un valor numérico de motivo para futuros análisis del coach virtual.

### Modified Capabilities
- `set-edit-unit-persistence`: Los requerimientos no cambian a nivel de especificación; solo se verá afectada la implementación porque el modelo de datos de sets incluirá nuevos campos opcionales.

## Impact

- Página `src/app/workout/[date]/page.tsx` (nueva acción en cards, nuevo modal y estado).
- API `src/app/api/workouts/by-date/[date]/exercises/route.ts` (nuevo endpoint/payload para cancelar en lugar de eliminar).
- Modelo `ExerciseSet` en `prisma/schema.prisma` (nuevos campos `isCancelled` y `cancelReasonCode`).
- Cola offline en `src/lib/offline-queue.ts` (nuevo tipo de mutación encolada).
- Posibles tipos TypeScript de set en la UI y en la API.
