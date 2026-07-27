## Why

Los ciclos 5/3/1 se generan de una sola vez con una base fija de pesos y repeticiones, y esa predicción se respeta como ley divina durante semanas. Mientras tanto el atleta mejora, estanca o acumula fatiga, y el plan no se entera. Necesitamos una capa de autorregulación que, llegado el día de entrenar, recalcule la sesión a partir del historial reciente y le ofrezca al usuario una propuesta actualizada que puede aceptar o rechazar — sin reescribir el motor de planificación ni tocar cómo se crea el ciclo base.

## What Changes

- Persistir el plan generado por `generate531Session` / `plan531Week` como **plan original** inmutable por sesión (no se pierde al recalcular).
- Nuevo cálculo de **propuesta recalculada** que se ejecuta al abrir una sesión en su fecha de ejecución, usando historial reciente (reps objetivo vs realizadas, RIR/e1rm reportado, feeling score, tendencia últimas 3 semanas, fatiga del bloque).
- Clasificación del ajuste en cuatro niveles: Sin cambios, Ajuste leve, Moderado, Agresivo — aplicando las reglas de negocio (mejorando / justo / por debajo / fatiga alta).
- Registro de **motivo del ajuste** (razón legible + señales usadas) junto a cada propuesta.
- UX en la vista de sesión del día: muestra plan original, sugerencia recalculada, resalta diferencias (peso / reps / series / volumen) y permite aceptar o rechazar explícitamente.
- La sesión ejecutada queda vinculada a la **versión elegida** (original o recalculada) con trazabilidad de ambas versiones y del motivo.
- Mínima extensión de esquema (campos opcionales / tabla de propuestas) sin romper compatibilidad ni renombrar nada existente.
- Fallbacks: sin historial suficiente → plan base sin recálculo; datos incompletos → no bloquear la sesión; cambios irrelevantes → no mostrar sugerencia.

## Capabilities

### New Capabilities
- `session-recalculation`: Cálculo de propuesta recalculada de una sesión 5/3/1 al llegar su fecha de ejecución, a partir del historial reciente y la fatiga del bloque, con clasificación del nivel de ajuste y motivo legible.
- `session-recalculation-confirmation`: UX de aceptación/rechazo de la propuesta recalculada en la vista de sesión del día, con trazabilidad de la versión elegida y conservación del plan original.

### Modified Capabilities
- `workout-day-exercises`: La vista de sesión del día pasa a presentar dos versiones de cada ejercicio (original y recalculada), las diferencias entre ambas, y a registrar cuál versión eligió el usuario.

## Impact

- `src/lib/training/531.ts` — exponer/conservar plan original; nueva función de recálculo.
- `src/app/api/plan/new-cycle/route.ts`, `src/app/api/plan/monthly/route.ts`, `src/app/api/plan/generate/route.ts` — persistir marca de "plan original" por sesión.
- `src/app/workout/[date]/page.tsx`, `src/app/workout/[date]/[exerciseId]/page.tsx` — invocar recálculo al abrir, mostrar ambas versiones y elección del usuario.
- Esquema Prisma: extensión mínima (tabla `SessionRecalculation` / campos opcionales en `WorkoutSession`).
- DB: sin migraciones destructivas; sólo adiciones nullable.
- Tests: ampliar `tests/unit/531.test.ts` con el recálculo.