## 1. Esquema y migración

- [x] 1.1 Añadir `recalculationVersion Int?`, `recalcReason String?` a `model WorkoutSession` en `prisma/schema.prisma`
- [x] 1.2 Añadir `isOriginalPlan Boolean @default(false)` a `model ExerciseSet`
- [x] 1.3 Generar migración aditiva (`prisma migrate dev --name add_recalc_fields`) y verificar que no hay cambios destructivos
- [x] 1.4 Regenerar Prisma Client (`src/generated/prisma`) y confirmar tipos nuevos

## 2. Motor de recálculo (puro)

- [ ] 2.1 Exportar `RECALC_THRESHOLDS` (constantes ajustables: umbrales 0.05/0.1/0.15/0.25, % 2.5/5, 1 rep) en `src/lib/training/531.ts`
- [ ] 2.2 Implementar `recalculate531Session(input): { level, suggestedSets, reasons }` en `src/lib/training/531.ts` — función pura que toma `{ originalSets, historySets, feelingHistory, blockWeekIndex }` y aplica las reglas del design (Mejorando/Justo/Por debajo/Fatiga alta)
- [ ] 2.3 Caso `Sin cambios` por historial insuficiente (< 3 sesiones del lift) retorna sin sugerencias con reason `"historial insuficiente"`
- [ ] 2.4 Tolerancia a datos incompletos: campos ausentes (`rir`, `feelingScore`, `e1rm`) se omiten del promedio, nunca lanzan error
- [ ] 2.5 Añadir tests unitarios en `tests/unit/531.test.ts` cubriendo un escenario de cada nivel (Leve, Moderado, Agresivo, Por debajo, Fatiga alta, Sin cambios)

## 3. Conservación del plan original

- [ ] 3.1 En `POST /api/plan/new-cycle`, `POST /api/plan/monthly`, `POST /api/plan/generate` confirmar que los `ExerciseSet` persistidos quedan con `WorkoutSession.recalculationVersion = null` (plan original implícito)
- [ ] 3.2 Implementar helper `snapshotOriginal(sessionId)` que clona los `ExerciseSet` actuales a una sesión espejo con `title = title + " (original)"` y marca los clones con `isOriginalPlan = true` (resolver D1/D5 del design: sesión espejo vs ExerciseSet marcado — preferir sesión espejo para filtrado trivial)
- [ ] 3.3 Ajustar `groupSetsByExercise` en `/workout/[date]/page.tsx` para filtrar las sesiones espejo ` (original)` por defecto en la lectura del día

## 4. Endpoint de recálculo

- [ ] 4.1 Crear `GET /api/workout/[date]/recalc/route.ts` que ensamble historial (últimas 3 semanas de `ExerciseSet` del mismo `liftId`, no cancelados), `feelingScore` por sesión y `blockFatigue`, llame a `recalculate531Session`, devuelva `{ level, suggestedSets, reasons, originalSets }`
- [ ] 4.2 Si < 3 sesiones de historial del lift, retornar `{ level: "Sin cambios", reasons: ["historial insuficiente"], suggestedSets: originalSets }`
- [ ] 4.3 Cache del resultado con `cacheResource` key `recalc-[date]`; invalidar al mutar sets del día (mismo key que `cacheWorkoutDay`)

## 5. Endpoint de aceptación/rechazo

- [ ] 5.1 Crear `POST /api/workout/[date]/recalc/accept/route.ts` con body `{ accepted: boolean }`
- [ ] 5.2 Si `accepted=true`: llamar `snapshotOriginal(sessionId)`, sobrescribir `ExerciseSet` de la sesión con los valores recalculados (`targetWeight`/`repsTarget`/`percentage`), fijar `WorkoutSession.recalculationVersion = 1`, guardar `recalcReason` con el motivo legible
- [ ] 5.3 Si `accepted=false`: fijar `WorkoutSession.recalculationVersion = 0`, guardar `recalcReason` con el motivo ofrecido (para rear por qué se rechazó)
- [ ] 5.4 Registrar la operación en `UserActivityLog` (`action: "recalc_accept" | "recalc_reject"`, `metadata` con el nivel y lift)

## 6. UX — banner de recálculo

- [ ] 6.1 Crear componente `src/components/recalc-banner.tsx` (banner colapsable usando `panel-soft`, iconos `lucide-react`): muestra `level` + resumen, al expandir diferencias por set (peso/reps/series/intensidad/volumen)
- [ ] 6.2 Filas `original → sugerido` con delta destacado: accent `#d6ff43` para subidas, `gray-400` para bajadas; delta < 1% sin destacar
- [ ] 6.3 Dos botones: **Aceptar** (`btn-accent`) y **Seguir plan original** (`btn-dark`)
- [ ] 6.4 Integrar banner en `/workout/[date]/page.tsx`: fetch de `GET /api/workout/[date]/recalc`, render condicional (sólo si `level !== "Sin cambios"`)
- [ ] 6.5 Al aceptar/rechazar, POST a `/recalc/accept`, actualizar `recalculationVersion` en estado y desaparecer banner
- [ ] 6.6 Botón **+** de agregar ejercicio deshabilitado mientras haya propuesta activa sin resolver (escenario `workout-day-exercises`)

## 7. Offline y sincronización

- [ ] 7.1 Encolar `POST /recalc/accept` en la offline queue existente (`offline-queue.ts`) con el mismo patrón que las mutaciones de workout
- [ ] 7.2 Aplicar optimistamente `recalculationVersion` en la UI al aceptar/rechazar estando offline
- [ ] 7.3 Invalidar `recalc-[date]` y `cacheWorkoutDay(date)` al aplicar la mutación
- [ ] 7.4 Mensaje `syncError` reusado del patrón existente cuando la sync falla

## 8. Trazabilidad y verificación

- [ ] 8.1 Garantizar que el snapshot original queda recuperable (sesión espejo ` (original)`) tras aceptar la propuesta
- [ ] 8.2 Test E2E en `tests/e2e/` cubriendo: crear cycle, abrir día con historial previo (fixture), aceptar propuesta, ejecutar sets, verificar `recalculationVersion = 1` y snapshot conservado
- [ ] 8.3 Lint + typecheck (`pnpm lint`, `pnpm typecheck` o equivalente del repo) y tests unitarios pasando
- [ ] 8.4 Documentar en este change cualquier desviación del design (p.ej. decisión final sesión espejo vs ExerciseSet marcado) en una nota al pie de `design.md`