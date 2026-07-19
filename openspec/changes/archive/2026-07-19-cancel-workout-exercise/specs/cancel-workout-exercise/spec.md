## ADDED Requirements

### Requirement: Exercise card shows a cancel action
The system SHALL display a "Cancelar" action on each exercise card in the `/workout/[date]` page.

#### Scenario: User views workout day
- **WHEN** the user opens a workout day with at least one exercise
- **THEN** every exercise card displays a cancel action alongside the existing reorder and delete actions

#### Scenario: Cancel action is accessible
- **WHEN** the user focuses or taps the cancel action
- **THEN** the action does not trigger card navigation or reorder

### Requirement: Cancel action opens a confirmation modal
The system SHALL open a confirmation modal when the user chooses to cancel an exercise.

#### Scenario: User taps cancel
- **WHEN** the user taps the cancel action on an exercise card
- **THEN** a modal opens asking for confirmation and a cancellation reason

#### Scenario: Modal requires a reason
- **WHEN** the modal is open
- **THEN** the user cannot confirm cancellation until a reason is selected

### Requirement: Cancellation reasons are fixed and numeric
The system SHALL provide exactly three cancellation reasons, each with a fixed numeric value.

#### Scenario: Reasons displayed
- **WHEN** the cancellation modal is open
- **THEN** the reasons "Cansancio" (1), "Falta de tiempo" (2), and "Otro" (3) are shown as selectable options

#### Scenario: Reason value persisted
- **WHEN** the user selects "Falta de tiempo" and confirms
- **THEN** the system stores reason value 2 for the cancelled exercise

### Requirement: Cancelled state is persisted per set
The system SHALL persist the cancelled state and reason code on the exercise sets belonging to the workout day.

#### Scenario: Cancel an exercise
- **WHEN** the user confirms cancellation for an exercise with reason "Cansancio"
- **THEN** all sets of that exercise in the day are marked with `isCancelled: true` and `cancelReasonCode: 1`

#### Scenario: Cancelled sets remain in the database
- **WHEN** an exercise is cancelled
- **THEN** the exercise and its sets are not deleted; only the cancelled flags are updated

### Requirement: Cancelled exercises are synced with the backend
The system SHALL send the cancellation to the backend API.

#### Scenario: Online cancellation
- **WHEN** the user confirms cancellation while online
- **THEN** the frontend calls the API endpoint and updates the local state on success

#### Scenario: Offline cancellation
- **WHEN** the user confirms cancellation while offline
- **THEN** the frontend updates the local state and enqueues the mutation to sync later

### Requirement: Cancelled state is visible on the card
The system SHALL visually indicate that an exercise has been cancelled.

#### Scenario: Exercise is cancelled
- **WHEN** an exercise has at least one set with `isCancelled: true`
- **THEN** the card shows a visual indicator (e.g., reduced opacity, strike-through, or label) that distinguishes it from completed and pending exercises

### Requirement: Cancelled state is returned by the day API
The system SHALL include `isCancelled` and `cancelReasonCode` in the response of the `/api/workouts/by-date/[date]` endpoint.

#### Scenario: Fetch cancelled workout day
- **WHEN** the frontend requests the workout day data
- **THEN** the response includes the cancelled flags for each set
