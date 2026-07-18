## 1. Heading typography unification

- [x] 1.1 In `src/app/globals.css`, update the `h1, h2, h3, label, .font-heading` rule so `font-family` is `Rajdhani, "Rajdhani Fallback", sans-serif` (keep existing `letter-spacing`, `text-transform`, `font-style` unless they conflict; drop the old `var(--font-heading)` Bebas Neue resolution).
- [x] 1.2 In `src/app/layout.tsx`, remove the `Bebas_Neue` import and the `heading.variable` class from `<html>`; keep the `Rajdhani` (`--font-body`) wiring.
- [x] 1.3 Grep `src/` for `Bebas` / `--font-heading` usages and normalize any leftover references to the shared Rajdhani stack.

## 2. Dashboard "Ir al workout" CTA → button

- [x] 2.1 In `src/components/next-workout.tsx`, replace the "Ir al workout" `<a>` element with a `<button type="button">` styled with the existing `btn-accent` class plus small sizing (e.g. `px-3 py-1.5 text-xs uppercase tracking-[0.14em]`).
- [x] 2.2 On click, call `router.push(`/workout/${workoutIsoDate}`)` (router is already available in the component).
- [x] 2.3 Verify the "no session" / loading branches are unaffected and the button only renders when a session exists.

## 3. Workout-day cards → dashboard identity

- [x] 3.1 In `src/app/workout/[date]/page.tsx`, align the "next" exercise card root classes so the surface uses the dashboard "Próximo Workout" accent treatment (`#d6ff43`) — keep the existing accent surface but reconcile border radius, border, and glow with the dashboard card.
- [x] 3.2 Align non-next exercise cards to use the shared `panel`/`panel-soft` surfaces instead of bespoke card chrome.
- [x] 3.3 Normalize exercise-card title typography to match the dashboard card's title scale and `.font-heading` (Rajdhani) family; keep the `set-card-title*` animation markup intact.
- [x] 3.4 Preserve per-lift (BP/DL/SQ) color theming on badges/accents only; do not let per-lift hues override the shared card-surface identity.
- [x] 3.5 Leave the inline `<style jsx>` animation block untouched.

## 4. Application-wide typography audit

- [x] 4.1 Grep `src/**/*.{tsx,ts,css}` for inline `font-family` declarations and heading-font overrides outside `globals.css`.
- [x] 4.2 Remove or normalize each conflict to `font-heading` / `var(--font-body)` (Rajdhani stack).
- [x] 4.3 Spot-check `progress-chart.tsx`, `volume-by-lift-card.tsx`, `meet-coefficients-card.tsx`, `calendar.tsx`, and settings/nutrition/plan pages for title typography compliance.

## 5. Verification

- [x] 5.1 Run `pnpm lint` and `pnpm typecheck` (confirm command with user/AGENTS.md if missing) and resolve any new errors.
- [x] 5.2 Visual smoke: dashboard, workout-day (next and non-next cards), and every component touched in section 4 — confirm Rajdhani headings and unified card identity.
- [x] 5.3 Run the existing Playwright e2e (`pnpm exec playwright test` if applicable) to confirm no behavioral regression in the offline-sync flow that touches the workout-day page.