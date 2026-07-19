## Context

The set edit modal in `src/app/workout/[date]/[exerciseId]/page.tsx` already converts the target weight value when the unit button is toggled (`kg` ↔ `lb`). However, the selected `editUnit` is never sent to the backend or merged back into the local set state. The current `PATCH /api/workouts/[sessionId]/sets/[setId]` endpoint schema ignores `unit`, and the offline mutation payload type does not include it. The database already has an `ExerciseSet.unit` field, so no migration is needed.

## Goals / Non-Goals

**Goals:**
- Persist the user-selected unit when saving an edited set.
- Keep the local UI state and cached workout data consistent after a unit change.
- Ensure offline-queued set edits also carry the new unit.

**Non-Goals:**
- Changing how unit conversion is calculated.
- Adding a global setting for default units.
- Modifying the exercise-form modal used when building a plan (it already has its own unit handling).

## Decisions

- **Include `unit` in the edit payload.** Add `unit` to the local optimistic state update, the `PATCH` request body, and the offline `SetUpdatePayload`. This is the smallest fix that keeps the frontend, backend, and queue in sync.
- **Use `WeightUnit` union for the frontend state.** The frontend already casts `set.unit` to `'kg' | 'lb'`. Use the existing `WeightUnit` type from `src/lib/units/conversion` to keep the API contract aligned.
- **Update the backend schema to accept `unit` as optional.** Make `unit` optional in `updateSetSchema` so existing clients that do not send it continue to work; when provided, Prisma updates the field. This avoids a breaking change while fixing the bug.
- **Keep value conversion in the frontend.** Conversion happens at edit time (when the user toggles the unit button), so the backend stores the already-converted value. No server-side conversion is introduced.

## Risks / Trade-offs

- [Risk] Adding `unit` to the API may be rejected by older queued offline mutations if the app is downgraded after this change. → Mitigation: `unit` is optional in the schema; queued payloads without `unit` still validate.
- [Risk] The local set state shows the converted value before the server confirms it, which could briefly mismatch if the request fails. → Mitigation: on failure, the existing rollback restores the pre-edit `confirmedBeforeEdit` snapshot; we extend that snapshot to include the original `unit` so the UI reverts correctly.

## Migration Plan

No migration is required. The `unit` column already exists in the `ExerciseSet` table. Deploy the frontend and backend changes together; the API change is backward compatible.
