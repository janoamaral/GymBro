## Context

Today the app loads two display fonts in `src/app/layout.tsx`:
- `Bebas_Neue` → `--font-heading` (used by `h1`/`h2`/`h3`/`label`/`.font-heading` in `globals.css`)
- `Rajdhani` → `--font-body` (body text via `body { font-family: var(--font-body) }`)

The dashboard "Próximo Workout" card (`src/components/next-workout.tsx`) establishes the intended visual identity: `panel` surface, accent `#d6ff43`, badges with `tracking-[0.14em]`–`[0.18em]`, and an "Ir al workout" link at the bottom. The workout-day exercise cards (`src/app/workout/[date]/page.tsx`) diverge: they use `font-heading font-black` titles with no shared typographic scale, a bespoke `bg-accent` "next" treatment, and inline `<style jsx>` block. Other components (`progress-chart.tsx`, `volume-by-lift-card.tsx`, `meet-coefficients-card.tsx`, `calendar.tsx`, settings/nutrition/plan pages) may also hold stray heading typography.

No data, state, or routing changes are involved — this is a pure presentation refactor.

## Goals / Non-Goals

**Goals:**
- One typographic identity for the whole app, anchored on Rajdhani, matching the dashboard.
- "Ir al workout" CTA becomes a small `btn-accent` button.
- Workout-day exercise cards adopt the dashboard "Próximo Workout" card's visual language (surface, accent, typography) while preserving per-lift color theming and the `#d6ff43` accent.
- Remove Bebas Neue dependency.

**Non-Goals:**
- Redesigning layouts, spacing, or component composition beyond typography/CTA/card-surface alignment.
- Touching the offline cache, fetch, drag-and-drop reorder, or any behavioral logic in the workout-day page.
- Introducing a design-system or component library.
- Changing body text font, color tokens, or the `.panel`/`.panel-soft` chrome itself.

## Decisions

**1. Repoint `--font-heading` to Rajdhani instead of introducing a third font variable.**
Rajdhani is already loaded via `--font-body`. Setting `--font-heading: var(--font-body)` (or directly to the Rajdhani variable) collapses the two display stacks to one and lets existing `font-heading` consumers inherit the new identity with no per-file edits. Alternative: keep Bebas Neue and only change new components — rejected, the proposal's whole point is a unified identity.

The exact stack `Rajdhani, "Rajdhani Fallback", sans-serif` is enforced by updating the `h1,h2,h3,label,.font-heading` rule in `globals.css` to that explicit stack (not just `var(--font-body)`) so the fallback string named in the requirement is present regardless of how `--font-body` is configured.

**2. Remove the `Bebas_Neue` import rather than keeping it unused.**
Dead font imports still ship a font file. Drop the import and the `heading.variable` class from `<html>` in `layout.tsx`.

**3. "Ir al workout" becomes a `<button>` with `btn-accent`, sized small.**
`btn-accent` already exists in `globals.css` for the accent CTA. Add small sizing (`px-3 py-1.5 text-xs`) and `router.push(href)` on click. Alternative: style the `<a>` as a button — rejected because the requirement explicitly asks for a button.

**4. Workout-day "next" card adopts the accent `#d6ff43` surface the dashboard uses, not the current `bg-accent` utility in isolation.**
Align the next-card to the dashboard "Próximo Workout" card's accent treatment (border, background tint, accent-glow if used) so the two "next action" surfaces read as one component family. Non-next cards switch to `panel`/`panel-soft` to match the dashboard's secondary surfaces. Per-lift color theming (BP/DL/SQ) from `next-workout.tsx`'s `LIFT_THEME` is preserved on the badge/accent only; the card surface identity stays shared.

**5. Audit is a grep + normalize pass, not a rearchitecture.**
Search `src/` for `font-family` and for classes that override heading typography; normalize anything that fights the shared stack to use `font-heading` / `var(--font-body)`. Ponytail: limit edits to actual conflicts, don't re-style components that are already correct.

## Risks / Trade-offs

- **Visual regression across surfaces** → Verify by visual smoke of dashboard, workout-day, and each touched component after each chunk; no automated visual tests exist, so rely on the dev build + existing Playwright e2e (`tests/e2e/offline-sync.spec.ts`) for behavioral non-regression.
- **Losing Bebas Neue's condensed look changes density** → Acceptable: the dashboard already reads well at Rajdhani and the requirement mandates the switch. Tune `letter-spacing` on the heading rule if titles feel too wide.
- **Per-lift theming vs. unified card identity** → Keep per-lift hues on the badge/accent only; the shared surface chrome is the unifying layer.
- **Inline `<style jsx>` in workout-day page** → Leave the animation styles (`set-card-*`, `drag-card-*`, `add-exercise-fab`) untouched; only align Tailwind utility classes on the card root and title. Removing the styled-jsx block is out of scope.