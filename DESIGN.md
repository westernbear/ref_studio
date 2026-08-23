# Reference Video Studio Design System

## 1. Theme

Reference Video Studio uses the Cosmic Engineering surface already encoded in `apps/web/src/styles/tokens.css`: near-black canvas, restrained white text, thin hairline dividers, compact mono metadata, and one operational accent.

## 2. Tokens

- Canvas: `--color-canvas`, `--color-canvas-soft`, `--color-canvas-card`
- Text: `--color-ink`, `--color-body`, `--color-body-mid`, `--color-on-surface-variant`
- Lines: `--color-hairline`, `--color-outline-variant`
- Accent: `--color-sunset`
- Radii: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`
- Spacing: `--space-xxs` through `--space-4xl`
- Type: `--type-display-*`, `--type-body-*`, `--type-caption-mono*`, `--type-button`

## 3. Typography

Display text uses Manrope. Body text uses Inter. Dense IDs, timestamps, states, and job metadata use Geist Mono. Korean-capable copy may use Wanted Sans through `--font-korean`.

## 4. Components

Buttons are 44px minimum targets with pill treatment for primary navigation actions. Panels use `--color-canvas-card`, one `--color-hairline` border, and small radii. Tables sit inside `.table-wrap` so narrow viewports scroll only the table when needed. Progress surfaces use a large numeric state, a thin meter, and live metadata panels without placeholder rows.

## 5. Layout

Creator and admin pages use bounded app shells with responsive wrapping navigation. Product workflow pages use a centered content width, while progress pages use a full-viewport shell with header/footer fixed in the document flow and a single main scroll region on small screens. Intrinsic grids must use `minmax(min(..., 100%), 1fr)` to avoid mobile overflow.

## 6. Motion

Motion is limited to state-bearing transitions: progress meter width, hover affordance, and live polling status. Animated decoration is not used.

## 7. Anti-Patterns

No mock data in production screens. No decorative image cards for workflow state. No nonfunctional controls. No horizontal overflow below 320px. No extra accent palettes outside the existing tokens.
