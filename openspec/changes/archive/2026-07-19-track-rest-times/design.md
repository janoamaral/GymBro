## Context

The app already has a manual rest timer (`RestTimerModal`) launched from the exercise detail page. It runs for a configurable number of seconds and closes when the user taps Finish or when the countdown reaches 0. Right now the timer is purely a cue; nothing about the elapsed rest time is saved.

`ExerciseSet` is the natural place to store rest data because every tracked set already represents a discrete piece of work. The requirement is to attach the actual rest interval that preceded that set.

## Goals / Non-Goals

**Goals:**
- Persist the elapsed rest-timer duration as `restSeconds` on the next pending set of the current exercise.
- Keep the implementation independent of set edit/update timestamps, so later edits do not rewrite the tracked rest value.
- Render the tracked value in the exercise detail view.
- Support offline usage by including `restSeconds` in the existing set mutation queue.

**Non-Goals:**
- Automatic rest detection or smart starting of the timer.
- Historical analytics, charts, or coaching recommendations based on rest data.
- Per-exercise rest targets or alerts.
- Rest tracking between individual sets of the same exercise.

## Decisions

1. **Store rest on `ExerciseSet` rather than deriving it from timestamps.**
   - Rationale: The user explicitly proposed this. Set edits change `updatedAt`, which would corrupt derived rest values. A dedicated column keeps the semantic meaning intact.
   - Alternative considered: deriving rest from the gap between consecutive `updatedAt` values. Rejected because edits and offline sync make timestamps unreliable.

2. **Use the rest timer as the source of truth, not the completion of the previous set.**
   - Rationale: The timer is the moment the user consciously measures rest. The value it reports when closed is the actual rest taken.
   - The modal will return how many seconds have elapsed (initial seconds minus remaining seconds, plus any +30 extensions).

3. **Attach the recorded rest to the next pending set of the current exercise.**
   - Rationale: When the user finishes resting, the next action is usually the next set. If all sets are done, the rest value is discarded.
   - The client will find the first `isDone === false` set in the current exercise and update it with the elapsed seconds.

4. **Reuse the existing `PATCH /api/workouts/[sessionId]/sets/[setId]` endpoint.**
   - Rationale: Minimal API surface. `restSeconds` is just another mutable set field and fits the existing offline mutation queue with no new mutation type.
   - Alternative considered: a dedicated rest endpoint. Rejected because it would require a separate offline queue path for a single integer.

5. **Make `restSeconds` nullable and optional everywhere.**
   - Rationale: Backward compatibility. Existing sets have no rest data, and users can still finish sets without using the timer.

## Risks / Trade-offs

- [UI ambiguity] If the user starts the timer after already completing some sets, the rest may be attached to a later set than the user expects.
  → Mitigation: always attach to the first not-done set of the current exercise; surface the value in the UI so the user sees what was recorded.
- [Offline drift] A rest value queued offline may be applied to a set whose state changed on another device.
  → Mitigation: the existing mutation queue merges payloads by set id, so the worst case is an outdated `restSeconds` field, same as any other queued set field.
- [Data resolution] One rest value per set is coarse; it does not capture rest between warm-up sets or rest before the first set.
  → Mitigation: documented as non-goal; this is the first step toward richer tracking.

## Migration Plan

1. Add `restSeconds Int?` to `ExerciseSet` in `prisma/schema.prisma`.
2. Run `prisma migrate dev` (or generate the migration) to add the column.
3. Generate the Prisma client so the new field is available in the app.
4. Deploy the API and client changes together; the field is nullable so existing rows remain valid.

## Open Questions

- Should we record rest when the timer finishes automatically (reaches 0) or only on explicit Finish? We will record in both cases because the user can keep going after 0.
- Should rest be editable? Out of scope for this change; if needed later it can reuse the set edit payload.
