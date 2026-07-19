## 1. Backend API

- [x] 1.1 Add optional `unit` field to `updateSetSchema` in `src/app/api/workouts/[sessionId]/sets/[setId]/route.ts` using a `'kg' | 'lb'` union validator.
- [x] 1.2 Update the Prisma `exerciseSet.update` call to set `unit: payload.unit` when provided.
- [x] 1.3 Use `payload.unit ?? set.unit` when resolving the unit for any server-side calculations (e.g. AMRAP e1rm) so the persisted unit is consistent.

## 2. Frontend Edit Modal

- [x] 2.1 Add `unit` to the `SetServerSnapshot` type and the `confirmedBeforeEdit` fallback in `src/app/workout/[date]/[exerciseId]/page.tsx`.
- [x] 2.2 Include `unit: editUnit` in the edit payload sent by `handleSaveSetEdit`.
- [x] 2.3 Update the local optimistic state (`setSets`) and cached day patch (`patchCachedSetsInDay`) to include `unit`.
- [x] 2.4 Extend the rollback path in `handleSaveSetEdit` to restore the original `unit` alongside the original weight and measure values.
- [x] 2.5 Update the `acknowledgeSetMutationFields` call to include `'unit'` as an acknowledged key.

## 3. Offline Queue

- [x] 3.1 Add optional `unit?: 'kg' | 'lb'` to `SetUpdatePayload` in `src/lib/offline-queue.ts`.
- [x] 3.2 Verify that `acknowledgeSetMutationFields` accepts `unit` in its `keys` parameter without a type error.

## 4. Verification

- [x] 4.1 Run TypeScript checks (`npm run typecheck` or `npx tsc --noEmit`) and fix any type errors.
- [x] 4.2 Manually verify the bug fix: open a set created in kg, toggle to lb, save, and confirm the set displays the converted value with the lb label.
- [x] 4.3 Repeat the reverse flow (lb → kg) and confirm the label updates correctly.
