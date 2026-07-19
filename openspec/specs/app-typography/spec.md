# Purpose

TBD — Unify application typography and card styling across the dashboard and workout-day views.

## Requirements

### Requirement: Single heading typography stack
The application SHALL render all titles — `h1`, `h2`, `h3`, `label`, and any element with the `font-heading` class — using the stack `Rajdhani, "Rajdhani Fallback", sans-serif`. The `--font-heading` CSS variable SHALL resolve to the same Rajdhani font loaded for the body (`--font-body`). The Bebas Neue font SHALL no longer be loaded or referenced.

#### Scenario: Heading renders with Rajdhani
- **WHEN** any view containing an `h1`, `h2`, `h3`, `label`, or `.font-heading` element is rendered
- **THEN** the computed `font-family` resolves to Rajdhani as the first family, with `"Rajdhani Fallback"` and `sans-serif` as successive fallbacks

#### Scenario: Bebas Neue is removed
- **WHEN** the application bundle is inspected
- **THEN** no `Bebas_Neue` import from `next/font/google` remains and no element computes to Bebas Neue

### Requirement: Dashboard "Próximo Workout" CTA is a button
The dashboard "Próximo Workout" card's "Ir al workout" action SHALL be a `<button>` element styled with the `btn-accent` surface, not an `<a>` link. Activation SHALL navigate to the workout day route via `router.push`.

#### Scenario: CTA rendered as button
- **WHEN** the dashboard renders with a next workout available
- **THEN** the "Ir al workout" control is a `<button>` element with the `btn-accent` class and no `<a>` link is used for that action

#### Scenario: CTA navigates to workout
- **WHEN** the user activates the "Ir al workout" button
- **THEN** the application navigates to `/workout/<workoutIsoDate>`

### Requirement: Workout-day cards match dashboard card identity
Exercise cards on the workout-day page SHALL share the visual identity of the dashboard "Próximo Workout" card: the "next" exercise card SHALL use the accent `#d6ff43` surface treatment consistent with the dashboard's accent, and non-next cards SHALL use the shared `panel`/`panel-soft` surfaces. Card typography (title scale, `font-heading` family, tracking, badge style) SHALL match the dashboard card.

#### Scenario: Next exercise card uses accent surface
- **WHEN** the workout-day page renders with a "next" (incomplete) exercise
- **THEN** that card's surface uses the `#d6ff43` accent treatment consistent with the dashboard "Próximo Workout" card, and its title uses Rajdhani via `.font-heading`

#### Scenario: Non-next exercise cards use shared panel
- **WHEN** the workout-day page renders exercises that are not the "next" exercise
- **THEN** those cards use `panel`/`panel-soft` surfaces (matching the dashboard's secondary surfaces) and Rajdhani headings

### Requirement: Application-wide typography audit
The application SHALL NOT contain stray `font-family` declarations or arbitrary utility classes that override the shared Rajdhani heading stack. Any inline `font-family` overrides on title/heading elements outside `globals.css` SHALL be removed or normalized to use `--font-heading` / `var(--font-body)`.

#### Scenario: No stray font overrides on titles
- **WHEN** `src/` is searched for inline `font-family` declarations or classes that override heading typography
- **THEN** none are found outside the central `globals.css` definition, and all titles render through the shared stack
