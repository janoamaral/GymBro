## Why

The app mixes two display typefaces: titles render with Bebas Neue (`--font-heading`) while body text uses Rajdhani (`--font-body`). This produces inconsistent typographic identity versus the dashboard, where the "Próximo Workout" card sets the intended visual language (accent `#d6ff43`, `panel`/`panel-soft` surfaces). Workout-day exercise cards diverge (different card chrome, no accent treatment for the "next" card matching the dashboard), and the "Ir al workout" call-to-action is a plain underlined link instead of a button — weakening the visual hierarchy. Unifying now is cheap (no behavioral change) and prevents the inconsistency from spreading as new screens are added.

## What Changes

- **BREAKING(visual only)**: Replace the Bebas Neue heading font with Rajdhani across the app. Headings (`h1`, `h2`, `h3`, `label`, `.font-heading`) use `Rajdhani, "Rajdhani Fallback", sans-serif`. The `Bebas_Neue` import in `layout.tsx` is removed; the `--font-heading` CSS variable is repointed at Rajdhani.
- Change the dashboard "Próximo Workout" "Ir al workout" element from an `<a>` link to a small `<button>`-styled control using the existing `.btn-accent` surface, navigating via `router.push`.
- Unify exercise (workout-day) cards with the dashboard "Próximo Workout" card: keep per-lift color theming but adopt the dashboard card's typographic scale, tracking, badge style, and accent treatment (`#d6ff43`) for the "next" exercise. Non-next cards align to the dashboard's `panel`/`panel-soft` styling.
- Audit `src/` for stray non-Rajdhani title classes and inline `font-family` overrides; normalize them to the shared heading typography.

## Capabilities

### New Capabilities
- `app-typography`: Single source of truth for application typographic identity (heading + body font stacks, fallbacks, tracking, transforms) and the rule that all titles share the dashboard's Rajdhani stack.

### Modified Capabilities
<!-- None: no spec-level behavioral requirements change. This is a visual-styling unification. -->

## Impact

- `src/app/layout.tsx`, `src/app/globals.css` (font wiring + heading rules).
- `src/components/next-workout.tsx` (link → button; typography).
- `src/app/workout/[date]/page.tsx` (card styling + typography to match dashboard).
- Audit touch-points across `src/components/**` and `src/app/**` for stray heading/label typography (e.g., `progress-chart.tsx`, `volume-by-lift-card.tsx`, `meet-coefficients-card.tsx`, `calendar.tsx`, settings/nutrition/plan pages).
- No data, API, or behavioral changes; pure presentational refactor. No new dependencies. Risk is visual regression across surfaces — verified by visual smoke of dashboard, workout-day, and each updated card.