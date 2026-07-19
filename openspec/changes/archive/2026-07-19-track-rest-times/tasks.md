## 1. Database & API

- [x] 1.1 Add `restSeconds Int?` to `ExerciseSet` in `prisma/schema.prisma`.
- [x] 1.2 Run Prisma migration (`pnpm prisma migrate dev`) and regenerate the client.
- [x] 1.3 Add `restSeconds` to the `updateSetSchema` in `src/app/api/workouts/[sessionId]/sets/[setId]/route.ts` and persist it in the `PATCH` handler.

## 2. Offline Queue

- [x] 2.1 Add `restSeconds?: number | null` to `SetUpdatePayload` in `src/lib/offline-queue.ts`.
- [x] 2.2 Ensure `acknowledgeSetMutationFields` accepts `'restSeconds'` as a tracked key.

## 3. Rest Timer Component

- [x] 3.1 Change `RestTimerModalProps` and `RestTimerModalContentProps` so `onClose` receives the elapsed seconds: `(elapsedSeconds: number) => void`.
- [x] 3.2 Track total elapsed time in `RestTimerModalContent` including +30 extensions and compute `initialSeconds - remaining + 30 * extensions` on close.

## 4. Exercise Detail Page

- [x] 4.1 Update the local `Set` interface to include `restSeconds: number | null`.
- [x] 4.2 Update the `RestTimerModal` call in `src/app/workout/[date]/[exerciseId]/page.tsx` to pass an `onClose` handler that receives elapsed seconds.
- [x] 4.3 On timer close, find the first `isDone === false` set of the current exercise and update its `restSeconds` locally and through the existing save path (same API call or offline queue used for other set fields).
- [x] 4.4 Add a visual indicator for `restSeconds` on each set card.

## 5. Caching & Display

- [x] 5.1 Include `restSeconds` in `SetServerSnapshot` and `confirmedSetValuesRef` so it survives edits and sync.
- [x] 5.2 Update `setsEqualForDisplay` in `src/app/workout/[date]/page.tsx` if needed so it does not treat rest-only changes as display updates.

## 6. Verification

- [x] 6.1 Run `pnpm type-check` and fix any TypeScript errors.
- [x] 6.2 Run the existing test suite (`pnpm test` or `pnpm test:unit`).
- [x] 6.3 Manually verify the timer records elapsed seconds, shows the value, and preserves it after editing a set.
