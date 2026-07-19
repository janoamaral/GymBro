## Why

GymBro is evolving from a simple workout logger into a virtual coach. To make useful training decisions, the coach needs richer data than just sets and reps. Rest time between exercises is a key training variable that affects recovery, volume tolerance, and fatigue management. Today the app has a manual rest timer, but the actual rest taken is not persisted anywhere. We want to capture that value so future coaching features can analyze and act on it.

## What Changes

- Add a `restSeconds` field to `ExerciseSet` to store the actual rest time observed before a set.
- When the user opens the rest timer and closes it (by tapping Finish or letting it run to 0), record the elapsed time on the next pending set of the current exercise.
- Expose `restSeconds` through the set update API so it can be saved from the client.
- Keep using the rest timer as the source of truth instead of deriving rest from `updatedAt`/`createdAt` timestamps, so edits to a set do not corrupt the rest data.
- Render the recorded rest time in the exercise detail view so the user can see what was tracked.

## Capabilities

### New Capabilities
- `rest-time-tracking`: Persist the elapsed time of the rest timer as the rest interval for the next set of the current exercise.

### Modified Capabilities
- None. The existing set-edit capability is reused only to carry a new optional field; its behavioral requirements do not change.

## Impact

- `prisma/schema.prisma` — new `restSeconds Int?` column on `ExerciseSet`.
- `src/app/api/workouts/[sessionId]/sets/[setId]/route.ts` — accept `restSeconds` in PATCH payload.
- `src/components/rest-timer-modal.tsx` — return elapsed seconds on close.
- `src/app/workout/[date]/[exerciseId]/page.tsx` — wire timer result to the next pending set and show the tracked value.
- `src/lib/offline-queue.ts` — include `restSeconds` in `SetUpdatePayload`.
- Existing cached workout days and server snapshots will ignore the new field until they are refreshed.
