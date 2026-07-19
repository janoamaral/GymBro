## Context

La página `/workout/[date]` muestra cada ejercicio del día como una card. Actualmente cada card tiene dos acciones: **reordenar** (drag handle) y **eliminar** (basurero). Eliminar un ejercicio lo borra físicamente de la base de datos. No existe una forma de registrar que un ejercicio planificado no se realizó ni por qué.

Para dar soporte al futuro coach virtual, se necesita distinguir entre "no se hizo" y "no se cargó". El motivo de cancelación se codificará numéricamente para que sea fácilmente agregable y analizable por el coach.

## Goals / Non-Goals

**Goals:**
- Agregar en cada card de ejercicio una acción de cancelar con un icono/CTA claro.
- Abrir un modal de confirmación que obligue a elegir un motivo antes de cancelar.
- Persistir el estado de cancelación y el motivo en el modelo de datos de `ExerciseSet`.
- Sincronizar la cancelación con el backend y la cola offline.
- Mostrar visualmente en la card que el ejercicio fue cancelado.
- Definir valores numéricos fijos para los motivos: Cansancio (1), Falta de tiempo (2), Otro (3).

**Non-Goals:**
- No cambiar el flujo de "Eliminar ejercicio"; seguirá eliminando físicamente los sets.
- No implementar el coach virtual ni el análisis de los motivos; solo preparar los datos.
- No agregar notificaciones, recordatorios ni lógica de compensación por cancelaciones.
- No modificar la plantilla semanal ni la generación automática de workouts.

## Decisions

1. **Almacenar la cancelación a nivel de set (`ExerciseSet`), no de ejercicio (`Exercise`).**
   - Rationale: Los sets son la entidad que vincula un ejercicio con un día específico. Un ejercicio puede aparecer en múltiples días con estados diferentes. Cancelar el ejercicio en un día equivale a marcar todos sus sets de ese día como cancelados.
   - Alternativa considerada: agregar una tabla `ExerciseCancellation` aparte. Rechazada porque añade una join innecesaria para un flag simple y pocos motivos.

2. **Usar dos nuevos campos en `ExerciseSet`: `isCancelled` (Boolean) y `cancelReasonCode` (Int?).**
   - Rationale: `isCancelled` permite filtrar rápidamente sin depender de la existencia de `cancelReasonCode`. `cancelReasonCode` es opcional (`Int?`) para mantener la compatibilidad con sets históricos y permite valores numéricos fijos.
   - Alternativa considerada: un solo enum de Prisma. Rechazada porque el proyecto ya usa códigos numéricos en otros campos (por ejemplo `setFeelingScore`) y es más fácil de escalar para el coach virtual.

3. **Mantener la acción "Eliminar" existente y agregar una nueva acción "Cancelar" separada.**
   - Rationale: Son intenciones distintas. El usuario puede querer borrar un ejercicio cargado por error (eliminar) o registrar que no lo hizo (cancelar). Mantener ambas evita pérdida de datos históricos.
   - Alternativa considerada: reemplazar eliminar por cancelar. Rechazada porque eliminar sigue siendo necesario para corregir errores de carga.

4. **Modal de confirmación con selección de motivo antes de persistir.**
   - Rationale: Cancelar afecta métricas y datos del coach; requiere confirmación explícita y una razón obligatoria.
   - Alternativa considerada: cancelar con un solo tap y luego preguntar. Rechazada porque aumenta el riesgo de cancelaciones accidentales y de datos incompletos.

5. **Sincronización offline mediante la cola de mutaciones existente.**
   - Rationale: El proyecto ya tiene `src/lib/offline-queue.ts` para operaciones pendientes. Reutilizarla mantiene la experiencia offline consistente.
   - Alternativa considerada: crear un sistema de sincronización aparte. Rechazada por duplicación de infraestructura.

## Risks / Trade-offs

- **[Risk]** El modelo de datos crece con dos campos más por set, y sets cancelados siguen apareciendo en consultas.  
  **Mitigation:** Los campos son opcionales e indexar no es necesario en este tamaño. La UI filtrará visualmente sets cancelados para mantener la card legible.

- **[Risk]** El usuario puede confundir "Eliminar" con "Cancelar" y terminar borrando datos que quería preservar.  
  **Mitigation:** El modal de cancelar tendrá título y motivos claros. El botón de eliminar ya usa `ConfirmDialog` con mensaje explícito. Se mantienen iconos y labels distintivos.

- **[Risk]** Sets cancelados podrían interferir con cálculos de volumen, progreso o estimaciones de 1RM.  
  **Mitigation:** Los endpoints de agregación y reportes deberán respetar `isCancelled: true`. En este cambio se actualizará la consulta de `/workouts/by-date/[date]` para devolver el flag, dejando que futuros reportes lo filtren.

- **[Risk]** La migración de base de datos requiere agregar columnas sin valores por defecto.  
  **Mitigation:** Ambos campos son opcionales (`isCancelled` con default `false`, `cancelReasonCode` nullable), por lo que la migración es segura y reversible.

## Migration Plan

1. Generar y ejecutar migración de Prisma para agregar `isCancelled` y `cancelReasonCode` a `ExerciseSet`.
2. Desplegar el backend con la nueva API de cancelación.
3. Desplegar el frontend con la nueva acción y modal.
4. Rollback: revertir migración y despliegues. Los sets cancelados durante la ventana de despliegue volverán a verse como sets normales, lo cual es aceptable para un feature nuevo.

## Open Questions

- ¿Se quiere mostrar el motivo de cancelación en texto dentro de la card o solo un indicador visual? (Se asume indicador visual sutil para no saturar la card.)
- ¿Los sets cancelados deben contar para el progreso del día? (Se asume que no, pero se deja el flag disponible para que futuras funcionalidades decidan.)
