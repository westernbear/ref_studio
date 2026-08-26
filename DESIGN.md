# Reference Video Studio Design System

## 1. Theme

Reference Video Studio uses the Cosmic Engineering surface already encoded in `apps/web/src/styles/tokens.css`: near-black canvas, restrained white text, thin hairline dividers, compact mono metadata, and one operational accent.

## 2. Tokens

- Canvas: `--color-canvas`, `--color-canvas-soft`, `--color-canvas-card`
- Text: `--color-ink`, `--color-body`, `--color-body-mid`, `--color-on-surface-variant`
- Lines: `--color-hairline`, `--color-outline-variant`
- Accent: `--color-sunset`
- Depth: `--color-rim` (lit top edge), `--shadow-plate`, `--shadow-plate-raised`
- Radii: `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-xl`, `--radius-pill`
- Spacing: `--space-xxs` through `--space-4xl`
- Type: `--type-display-*`, `--type-body-*`, `--type-caption-mono*`, `--type-button`

## 3. Typography

Display text uses Manrope. Body text uses Inter. Dense IDs, timestamps, states, and job metadata use Geist Mono. Korean-capable copy may use Wanted Sans through `--font-korean`.

## 4. Components

Buttons are 44px minimum targets with pill treatment for primary navigation actions. Panels use `--color-canvas-card`, one `--color-hairline` border, and small radii. The shared brand lockup displays `/logo.png` in a clipped, stable frame across creator, admin, auth, upload, and progress shells. Tables sit inside `.table-wrap` so narrow viewports scroll only the table when needed. Live record pages use native GET filters, an adjacent selected-record detail panel, and cursor pagination. Receipt decisions use a chronological timeline; audit and receipt exports expose the API's pending export state. Progress surfaces use a large numeric state, a thin meter, and live metadata panels without placeholder rows. Review choice forms use labeled native selects and numeric inputs inside the existing panel surface, with explicit owner and measured-rectangle modes.

## 5. Layout

Creator and admin pages use bounded app shells with responsive wrapping navigation. Product workflow pages use a centered content width. List/detail layouts use two desktop columns and stack in document order on narrow screens; pagination and export actions stay in normal flow. Progress pages use a full-viewport shell with header/footer fixed in the document flow and a single main scroll region on small screens. Intrinsic grids must use `minmax(min(..., 100%), 1fr)`, and unbroken metadata values must wrap inside their cells, to avoid mobile overflow.

## 6. Motion

Motion is limited to state-bearing transitions: progress meter width, hover affordance, live polling status, and the indeterminate ring shown while a stage is actually running. Animated decoration is not used. Every animation is slowed under `prefers-reduced-motion`, never left running at full speed.

## 7. Anti-Patterns

No mock data in production screens. No decorative image cards for workflow state. No nonfunctional controls. No horizontal overflow below 320px. No extra accent palettes outside the existing tokens.
