## ADDED Requirements

### Requirement: Edited set persists selected weight unit
The system SHALL update the stored weight unit of a set when the user changes the unit while editing that set.

#### Scenario: User switches unit and saves
- **WHEN** the user edits a set that was originally created with 10 kg
- **AND** the user toggles the unit from kg to lb
- **AND** the displayed weight value becomes 22 lb
- **AND** the user saves the edit
- **THEN** the system stores 22 as the target weight
- **AND** the system stores `lb` as the unit
- **AND** the set is displayed as "22 lb"

#### Scenario: User switches unit back and saves
- **WHEN** the user edits a set that was originally created with 22 lb
- **AND** the user toggles the unit from lb to kg
- **AND** the displayed weight value becomes 10 kg
- **AND** the user saves the edit
- **THEN** the system stores 10 as the target weight
- **AND** the system stores `kg` as the unit
- **AND** the set is displayed as "10 kg"

### Requirement: Offline-queued set edits include unit
The system SHALL include the selected weight unit in any set edit mutation that is queued for offline synchronization.

#### Scenario: Edit saved while offline
- **WHEN** the user saves a set edit that changed the unit
- **AND** the device is offline
- **THEN** the queued mutation payload includes the new `unit` value
- **AND** the mutation is acknowledged and removed from the queue once synchronized
