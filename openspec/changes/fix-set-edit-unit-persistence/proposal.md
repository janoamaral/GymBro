## Why

When editing a set in the workout detail page and switching the target-weight unit (e.g. from kg to lb), the numeric value is converted but the set's `unit` field is not updated. After saving, the app shows the converted number with the old unit label, so 10 kg becomes "22 kg" instead of "22 lb". This corrupts how target weight is displayed and persisted for future workouts.

## What Changes

- Update the set-edit modal in the workout detail page so that the selected unit is included in the save payload and reflected in local state.
- Extend the `PATCH /api/workouts/[sessionId]/sets/[setId]` endpoint schema to accept `unit` and persist it to the database.
- Update the offline-queue `SetUpdatePayload` type and `acknowledgeSetMutationFields` signature so that queued unit changes are correctly tracked and cleared.

## Capabilities

### New Capabilities

- `set-edit-unit-persistence`: Editing a set must preserve the user-selected weight unit by converting the value and updating the stored unit, so the set displays the correct weight and label after saving.

### Modified Capabilities

- (none — no existing spec-level requirements are changing, only the implementation is being corrected to match the intended behavior)

## Impact

- `src/app/workout/[date]/[exerciseId]/page.tsx` — edit modal state, save payload, and local cache update.
- `src/app/api/workouts/[sessionId]/sets/[setId]/route.ts` — `updateSetSchema` and Prisma update.
- `src/lib/offline-queue.ts` — `SetUpdatePayload` type and `acknowledgeSetMutationFields`.
- Database `ExerciseSet.unit` is already present in the Prisma schema and will now be updated from the UI.
