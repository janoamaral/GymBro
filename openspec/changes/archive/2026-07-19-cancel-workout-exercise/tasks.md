## 1. Data Model

- [x] 1.1 Add `isCancelled Boolean @default(false)` and `cancelReasonCode Int?` to `ExerciseSet` in `prisma/schema.prisma`
- [x] 1.2 Generate and run Prisma migration: `npx prisma migrate dev --name add_exercise_set_cancellation`
- [x] 1.3 Regenerate Prisma client and verify types compile

## 2. Backend API

- [x] 2.1 Add `PATCH /api/workouts/by-date/[date]/exercises?exerciseId=...` handler to cancel an exercise in `src/app/api/workouts/by-date/[date]/exercises/route.ts`
- [x] 2.2 Validate request body with zod: `cancelled: true` and `cancelReasonCode: 1 | 2 | 3`
- [x] 2.3 Update all `ExerciseSet` records for the exercise and day to `isCancelled: true` and `cancelReasonCode: <value>`
- [x] 2.4 Ensure `GET /api/workouts/by-date/[date]` returns the new fields in the set response
- [x] 2.5 Add offline queue support for cancellation in `src/lib/offline-queue.ts`

## 3. Frontend Types and UI

- [x] 3.1 Add `isCancelled?: boolean` and `cancelReasonCode?: number | null` to the `Set` interface in `src/app/workout/[date]/page.tsx`
- [x] 3.2 Add cancellation reason constants in the page: `CANCEL_REASONS = { FATIGUE: 1, NO_TIME: 2, OTHER: 3 }`
- [x] 3.3 Add a cancel action button on each exercise card (e.g., using an `X` or `Ban` icon) with `stopPropagation`
- [x] 3.4 Add state for the cancel modal: `showCancelExerciseModal`, `cancellingExerciseId`, `cancelReasonCode`, `cancelling`
- [x] 3.5 Implement a `Modal` with reason selection (radio buttons or selectable list) and confirm/cancel buttons
- [x] 3.6 Implement `handleCancelExercise` to call the API or enqueue offline mutation, update local state and cache
- [x] 3.7 Render a visual indicator on cancelled cards (e.g., reduced opacity, strikethrough title, or "Cancelado" label)
- [x] 3.8 Disable navigation or actions on cancelled cards as appropriate, or keep them visible but marked

## 4. Testing and Verification

- [x] 4.1 Run `npx tsc --noEmit` to check TypeScript errors
- [x] 4.2 Run `npm run lint` or `npx next lint` to check linting
- [x] 4.3 Test cancel flow manually: open `/workout/2026-07-20`, tap cancel, choose a reason, confirm, and verify the card is marked
- [x] 4.4 Test offline cancellation by disabling network and confirming the offline queue is used
- [x] 4.5 Verify that cancelled sets are not deleted and remain in the database
- [x] 4.6 Verify that the existing delete and reorder actions still work correctly
