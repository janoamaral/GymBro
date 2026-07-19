## ADDED Requirements

### Requirement: Rest timer duration is persisted as the rest interval for the next set
The system SHALL store the elapsed time of the rest timer as `restSeconds` on the next pending set of the current exercise when the user closes the rest timer.

#### Scenario: User closes the rest timer before it reaches zero
- **WHEN** the user opens the rest timer with an initial duration of 90 seconds
- **AND** 45 seconds elapse
- **AND** the user closes the timer
- **THEN** the system records 45 as the `restSeconds` value
- **AND** the system assigns that value to the first not-done set of the current exercise
- **AND** the value is persisted through the set update API or offline mutation queue

#### Scenario: Rest timer runs to zero
- **WHEN** the user opens the rest timer with an initial duration of 90 seconds
- **AND** the timer reaches zero
- **AND** the user closes the timer after it has finished
- **THEN** the system records 90 as the `restSeconds` value
- **AND** the system assigns that value to the first not-done set of the current exercise

#### Scenario: User extends the timer before closing
- **WHEN** the user opens the rest timer with an initial duration of 90 seconds
- **AND** the timer reaches zero
- **AND** the user taps +30 seconds twice
- **AND** the user closes the timer 40 seconds after the extensions
- **THEN** the system records 160 as the `restSeconds` value
- **AND** the system assigns that value to the first not-done set of the current exercise

### Requirement: Tracked rest time is visible in the exercise detail view
The system SHALL display the recorded `restSeconds` value for any set that has one.

#### Scenario: Set has a recorded rest time
- **WHEN** the user views an exercise that contains a set with `restSeconds` equal to 75
- **THEN** the system shows a rest indicator with the value 75 seconds for that set

#### Scenario: Set has no recorded rest time
- **WHEN** the user views an exercise that contains a set without a `restSeconds` value
- **THEN** the system does not show a rest indicator for that set

### Requirement: Set edit timestamps do not affect tracked rest time
The system SHALL keep `restSeconds` independent of `createdAt` and `updatedAt` values so that later edits to a set do not rewrite its recorded rest interval.

#### Scenario: User edits a set after rest was recorded
- **WHEN** a set has `restSeconds` equal to 60
- **AND** the user edits the set's target weight
- **AND** the edit is saved
- **THEN** the system updates the target weight
- **AND** the system preserves `restSeconds` as 60

### Requirement: Rest tracking works offline
The system SHALL queue `restSeconds` updates in the existing set mutation offline queue when the device is offline.

#### Scenario: Timer is closed while offline
- **WHEN** the user closes the rest timer
- **AND** the device is offline
- **THEN** the system stores the `restSeconds` value in the local set mutation queue
- **AND** the system synchronizes the value once the device is back online
