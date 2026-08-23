# Stitch Design System UI Implementation Inventory

Extraction target: `/home/singlerr/ref_studio/stitch-extracted/`

Archive root: `stitch_design_system_ui_implementation/`

## Full File Tree With Sizes

```text
stitch-extracted/
└── stitch_design_system_ui_implementation/
    ├── admin_audit_log/
    │   ├── code.html (20,722 bytes)
    │   └── screen.png (221,589 bytes)
    ├── admin_quarantine/
    │   ├── code.html (18,096 bytes)
    │   └── screen.png (211,098 bytes)
    ├── admin_receipt_chain/
    │   ├── code.html (20,159 bytes)
    │   └── screen.png (226,228 bytes)
    ├── admin_sign_in/
    │   ├── code.html (14,049 bytes)
    │   └── screen.png (72,517 bytes)
    ├── admin_tenants/
    │   ├── code.html (25,563 bytes)
    │   └── screen.png (150,039 bytes)
    ├── cosmic_engineering/
    │   └── DESIGN.md (8,158 bytes)
    ├── job_queue_delivery/
    │   ├── code.html (22,380 bytes)
    │   └── screen.png (171,868 bytes)
    ├── ref_studio_landing/
    │   ├── code.html (12,563 bytes)
    │   └── screen.png (100,841 bytes)
    ├── scene_review_approval/
    │   ├── code.html (23,311 bytes)
    │   └── screen.png (940,753 bytes)
    └── upload_validation/
        ├── code.html (17,431 bytes)
        └── screen.png (132,138 bytes)
```

## HTML Screens And Interactive Elements

### `stitch_design_system_ui_implementation/admin_audit_log/code.html`

Screen represented: Admin Ops System Audit Log screen.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | New Project | `button` | Classes: `w-full bg-primary ... hover:bg-tertiary-container transition-colors`; no `id`, `onclick`, or `type` |
| 2 | Dashboard | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft hover:text-primary` |
| 3 | Tenants | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft hover:text-primary` |
| 4 | Jobs | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft hover:text-primary` |
| 5 | Receipts | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft hover:text-primary` |
| 6 | Quarantine | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft hover:text-primary` |
| 7 | Audit | `a` active nav item | `href="#"`; active styling `bg-canvas-soft text-primary border-r-2 border-primary` |
| 8 | Docs | `a` footer nav item | `href="#"`; classes include `hover:bg-canvas-soft hover:text-primary` |
| 9 | Support | `a` footer nav item | `href="#"`; classes include `hover:bg-canvas-soft hover:text-primary` |
| 10 | Download icon | `button` | Icon-only button with `data-icon="download"`; classes include `hover:text-primary`; likely exports audit log |
| 11 | Search events, IDs... | `input type="text"` | Placeholder `Search events, IDs...`; classes include `focus:border-outline-variant`; no `name` or `id` |
| 12 | All Event Types | `select` dropdown | Options: `all`, `auth`, `data`, `job`, `config`; no `id` or `name` |
| 13 | Last 24 Hours | `select` dropdown | Options: `24h`, `7d`, `30d`, `custom`; no `id` or `name` |
| 14 | Previous page | `button` | Icon `chevron_left`; `disabled=""`; classes include `disabled:opacity-50` |
| 15 | Next page | `button` | Icon `chevron_right`; classes include `hover:bg-canvas hover:border-hairline` |

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; inline style sets dark canvas/body colors.

### `stitch_design_system_ui_implementation/admin_quarantine/code.html`

Screen represented: Admin Ops Quarantine Manager screen.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | New Project | `button` | Classes include `hover:bg-tertiary transition-colors`; no `id`, `onclick`, or `type` |
| 2 | Dashboard | `a` nav item | `href="#"`; icon `data-icon="dashboard"`; hover classes |
| 3 | Tenants | `a` nav item | `href="#"`; icon `data-icon="groups"`; hover classes |
| 4 | Jobs | `a` nav item | `href="#"`; icon `data-icon="terminal"`; hover classes |
| 5 | Receipts | `a` nav item | `href="#"`; icon `data-icon="receipt_long"`; hover classes |
| 6 | Quarantine | `a` active nav item | `href="#"`; icon `data-icon="emergency_home"`; active `bg-canvas-soft text-primary border-r-2 border-primary` |
| 7 | Audit | `a` nav item | `href="#"`; icon `data-icon="security"`; hover classes |
| 8 | Docs | `a` footer nav item | `href="#"`; icon `data-icon="description"`; hover classes |
| 9 | Support | `a` footer nav item | `href="#"`; icon `data-icon="contact_support"`; hover classes |
| 10 | View Evidence for `#QT-8992-FX` | `button` | Row action; classes include `hover:bg-surface-container`; no `onclick` |
| 11 | Release for `#QT-8992-FX` | `button` | Disabled-looking visual state only: `opacity-50 cursor-not-allowed`; no `disabled` attribute |
| 12 | View Evidence for `#QT-8993-AL` | `button` | Row action; classes include `hover:bg-surface-container`; no `onclick` |
| 13 | Release for `#QT-8993-AL` | `button` | Disabled-looking visual state only: `opacity-50 cursor-not-allowed`; no `disabled` attribute |
| 14 | View Evidence for `#QT-8994-ZN` | `button` | Row action; classes include `hover:bg-surface-container`; no `onclick` |
| 15 | Release for `#QT-8994-ZN` | `button` | Disabled-looking visual state only: `opacity-50 cursor-not-allowed`; no `disabled` attribute |

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; inline style sets Inter font and Material Symbols family.

### `stitch_design_system_ui_implementation/admin_receipt_chain/code.html`

Screen represented: Admin Ops Receipt Chain Viewer screen.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | New Project | `button` | Classes include `hover:bg-tertiary-fixed-dim transition-colors`; no `id`, `onclick`, or `type` |
| 2 | Dashboard | `a` nav item | `href="#"`; hover classes |
| 3 | Tenants | `a` nav item | `href="#"`; hover classes |
| 4 | Jobs | `a` nav item | `href="#"`; hover classes |
| 5 | Receipts | `a` active nav item | `href="#"`; active `bg-canvas-soft text-primary border-r-2 border-primary` |
| 6 | Quarantine | `a` nav item | `href="#"`; hover classes |
| 7 | Audit | `a` nav item | `href="#"`; hover classes |
| 8 | Docs | `a` footer nav item | `href="#"`; hover classes |
| 9 | Support | `a` footer nav item | `href="#"`; hover classes |
| 10 | Export Log | `button` | Icon `download`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 11 | T1: INIT | Timeline `li` clickable item | Classes include `group cursor-pointer`; no explicit event handler |
| 12 | T2: PRE-FLIGHT | Timeline `li` clickable item | Classes include `group cursor-pointer`; no explicit event handler |
| 13 | T4: EXECUTION | Timeline `li` clickable item | Classes include `group cursor-pointer`; no explicit event handler |
| 14 | RC-8891-Z-01 predecessor receipt | Clickable card/div | Classes include `hover:border-outline-variant cursor-pointer group`; likely opens linked receipt; no explicit event handler |

Note: `T3: AUTH_GATE` is selected/current with `cursor-default`, so it is not counted as clickable.

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; inline style sets Inter font.

### `stitch_design_system_ui_implementation/admin_sign_in/code.html`

Screen represented: Creator Studio Admin Login screen.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | Login card form | `form` | Class `flex flex-col gap-lg w-full`; no `action`, `method`, or submit handler |
| 2 | Identifier | `input type="text"` | `id="identifier"`; placeholder `node.operator@system.io`; paired with `label for="identifier"` |
| 3 | Secret | `input type="password"` | `id="secret"`; placeholder bullet mask; paired with `label for="secret"` |
| 4 | Sign in | `button type="button"` | Icon `login`; classes include `active:scale-[0.98]`; type prevents default form submit unless wired |
| 5 | Forgot Secret? | `a` link | `href="#"`; classes include `hover:text-primary` |
| 6 | Node Support | `a` link | `href="#"`; icon `contact_support`; classes include `hover:text-primary` |
| 7 | Privacy | `a` footer link | `href="#"`; classes include `hover:text-white` |
| 8 | Terms | `a` footer link | `href="#"`; classes include `hover:text-white` |
| 9 | API Status | `a` footer link | `href="#"`; classes include `hover:text-white` |
| 10 | Security | `a` footer link | `href="#"`; classes include `hover:text-white` |

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; no custom inline behavior script.

### `stitch_design_system_ui_implementation/admin_tenants/code.html`

Screen represented: Admin Ops Tenant List / Tenant Detail Drawer screen.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | New Project | `button` | Icon `add`; classes include `hover:bg-tertiary-fixed-dim`; no `onclick` |
| 2 | Dashboard | `a` nav item | `href="#"`; hover classes |
| 3 | Tenants | `a` active nav item | `href="#"`; active `bg-canvas-soft text-primary border-r-2 border-primary` |
| 4 | Jobs | `a` nav item | `href="#"`; hover classes |
| 5 | Receipts | `a` nav item | `href="#"`; hover classes |
| 6 | Quarantine | `a` nav item | `href="#"`; hover classes |
| 7 | Audit | `a` nav item | `href="#"`; hover classes |
| 8 | Docs | `a` footer nav item | `href="#"`; hover classes |
| 9 | Support | `a` footer nav item | `href="#"`; hover classes |
| 10 | Search tenants... | `input type="text"` | Placeholder `Search tenants...`; no `id` or `name`; classes include `focus:border-outline-variant` |
| 11 | Filter | `button` | Icon `filter_list`; classes include `hover:border-outline-variant`; no `onclick` |
| 12 | Aegis Corporation row | `tr` clickable table row | `onclick="toggleDetails(true)"`; classes include `cursor-pointer`; selected style `bg-canvas-soft` |
| 13 | Aegis Corporation row more menu | `button` | Icon `more_vert`; classes include `hover:bg-surface-container`; no `onclick` |
| 14 | Vanguard Labs row | `tr` clickable table row | `onclick="toggleDetails(true)"`; classes include `cursor-pointer` |
| 15 | Vanguard Labs row more menu | `button` | Icon `more_vert`; classes include `hover:bg-surface-container`; no `onclick` |
| 16 | Helios Network row | `tr` clickable table row | `onclick="toggleDetails(true)"`; classes include `cursor-pointer` |
| 17 | Helios Network row more menu | `button` | Icon `more_vert`; classes include `hover:bg-surface-container`; no `onclick` |
| 18 | Close detail drawer | `button` | Icon `close`; `onclick="toggleDetails(false)"`; closes `#details-drawer` |
| 19 | Recent activity: `seq_align_99` completed | Hoverable card/list item | Classes include `hover:bg-surface-container transition-colors`; no cursor or handler, but styled as inspectable/clickable activity row |
| 20 | Recent activity: `j.doe` added to group Operators | Hoverable card/list item | Classes include `hover:bg-surface-container transition-colors`; no cursor or handler |
| 21 | Recent activity: Storage quota warning threshold reached | Hoverable card/list item | Classes include `hover:bg-surface-container transition-colors`; no cursor or handler |
| 22 | Manage Access | `button` | Classes include `hover:bg-surface-bright`; no `onclick` |
| 23 | Suspend | `button` | Classes include `text-sunset hover:bg-surface-bright`; no `onclick` |

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; inline CSS styles icons/body/scrollbars; inline JS defines `toggleDetails(show)` for the details drawer.

### `stitch_design_system_ui_implementation/job_queue_delivery/code.html`

Screen represented: REF_STUDIO Job Queue & Delivery screen.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | Dashboard | `a` side nav item | `href="#"`; hover classes |
| 2 | Tenants | `a` side nav item | `href="#"`; hover classes |
| 3 | Jobs | `a` active side nav item | `href="#"`; active `bg-primary text-on-primary rounded-full` |
| 4 | Receipts | `a` side nav item | `href="#"`; hover classes |
| 5 | Quarantine | `a` side nav item | `href="#"`; hover classes |
| 6 | Audit | `a` side nav item | `href="#"`; hover classes |
| 7 | Export Logs | `button` | Classes include `hover:bg-canvas-soft`; no `onclick` |
| 8 | Support | `a` side footer nav item | `href="#"`; hover classes |
| 9 | Status | `a` side footer nav item | `href="#"`; hover classes |
| 10 | Workflow | `a` top nav active item | `href="#"`; active border-bottom styling |
| 11 | Admin | `a` top nav item | `href="#"`; hover classes |
| 12 | Docs | `a` top nav item | `href="#"`; hover classes |
| 13 | Support | `a` top nav item | `href="#"`; hover classes |
| 14 | Search resources... | `input type="text"` | Placeholder `Search resources...`; no `id` or `name` |
| 15 | Notifications | `button` | Icon `notifications`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 16 | Settings | `button` | Icon `settings`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 17 | New Project | `button` | Classes include `hover:bg-primary-container`; no `onclick` |
| 18 | Filter View | `button` | Icon `filter_list`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 19 | Abort Task for `#RND-8991-X` | `button` | Classes include `text-error hover:bg-error/10`; wrapped in row hover reveal `group-hover:opacity-100` |
| 20 | Download Render Report for `#RND-8990-W` | `button` | Classes include `hover:bg-surface-container-high`; no `onclick` |
| 21 | Download Video for `#RND-8990-W` | `button` | Icon `download`; classes include `hover:bg-surface-container-high`; no `onclick` |
| 22 | Prioritize for `#RND-8992-Y` | `button` | Classes include `hover:text-primary hover:bg-surface-container-high`; wrapped in row hover reveal `group-hover:opacity-100` |
| 23 | Download Render Report for `#RND-8985-V` | `button` | Classes include `hover:bg-surface-container-high`; no `onclick` |
| 24 | Download Video for `#RND-8985-V` | `button` | Icon `download`; classes include `hover:bg-surface-container-high`; no `onclick` |
| 25 | Previous page | `button` | Icon `chevron_left`; classes include `hover:bg-canvas-soft`; no disabled attribute |
| 26 | Next page | `button` | Icon `chevron_right`; classes include `hover:bg-canvas-soft`; no disabled attribute |
| 27 | API | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 28 | Legal | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 29 | Privacy | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 30 | GitHub | `a` footer link | `href="#"`; classes include `hover:text-primary` |

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; inline style sets body colors and custom scrollbar visuals.

### `stitch_design_system_ui_implementation/ref_studio_landing/code.html`

Screen represented: REF_STUDIO public/product landing page.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | REF_STUDIO brand | `a` brand/home link | `href="#"`; classes include display styling |
| 2 | Workflow | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft` |
| 3 | Admin | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft` |
| 4 | Docs | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft` |
| 5 | Support | `a` nav item | `href="#"`; classes include `hover:bg-canvas-soft` |
| 6 | New Project | `button` | Top-nav text button; classes include `hover:text-primary`; no `onclick` |
| 7 | Notifications | `button` | Icon `data-icon="notifications"`; classes include `active:scale-95 hover:bg-canvas-soft` |
| 8 | Settings | `button` | Icon `data-icon="settings"`; classes include `active:scale-95 hover:bg-canvas-soft` |
| 9 | Start Creating | `a` CTA link | `href="#"`; pill CTA classes include `hover:bg-primary hover:text-on-primary` |
| 10 | API | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 11 | Legal | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 12 | Privacy | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 13 | GitHub | `a` footer link | `href="#"`; classes include `hover:text-primary` |

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; inline style sets the body font family.

### `stitch_design_system_ui_implementation/scene_review_approval/code.html`

Screen represented: REF_STUDIO Scene Review Approval workflow screen.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | Workflow | `a` top nav active item | `href="#"`; active `text-primary border-b border-primary` |
| 2 | Admin | `a` top nav item | `href="#"`; hover classes |
| 3 | Docs | `a` top nav item | `href="#"`; hover classes |
| 4 | Support | `a` top nav item | `href="#"`; hover classes |
| 5 | Search projects... | `input type="text"` | Placeholder `Search projects...`; no `id` or `name` |
| 6 | New Project | `button` | Classes include `hover:bg-primary-container`; no `onclick` |
| 7 | Notifications | `button` | Icon `notifications`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 8 | Settings | `button` | Icon `settings`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 9 | Play source feed | `button` | Icon `play_arrow`; classes include `hover:text-breeze`; no `onclick` |
| 10 | Text Extraction (OCR) card | Hoverable card | Classes include `hover:border-outline-variant transition-colors group`; no cursor or handler, but visually inspectable |
| 11 | Camera Motion card | Hoverable card | Classes include `hover:border-outline-variant transition-colors group`; no cursor or handler |
| 12 | Light Fields card | Hoverable card | Classes include `hover:border-outline-variant transition-colors group`; no cursor or handler |
| 13 | EDIT TOPOLOGY | `button` | Text button; classes include `hover:text-breeze underline`; no `onclick` |
| 14 | Mapping row T1 / Main_Facade_Wall | Clickable `div` row | Classes include `hover:bg-canvas-soft transition-colors cursor-pointer`; no handler |
| 15 | Mapping row T2 / Signage_Board_01 | Clickable `div` row | Classes include `hover:bg-canvas-soft transition-colors cursor-pointer`; no handler |
| 16 | Mapping row T3 / Street_Debris_Scatter | Clickable `div` row | Classes include `hover:bg-canvas-soft transition-colors cursor-pointer`; no handler |
| 17 | Approve T1-T3 | `button` | Icon `verified`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 18 | Render Final | `button` | Icon `rocket_launch`; classes include `hover:bg-primary hover:text-on-primary`; no `onclick` |

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; inline style sets base body colors and custom scrollbar visuals.

### `stitch_design_system_ui_implementation/upload_validation/code.html`

Screen represented: REF_STUDIO Video Source Validation upload screen.

Interactive inventory:

| # | Text/label | Element type | Behavior hints |
|---:|---|---|---|
| 1 | Workflow | `a` nav item | `href="#"`; hover classes |
| 2 | Admin | `a` nav item | `href="#"`; hover classes |
| 3 | Docs | `a` nav item | `href="#"`; hover classes |
| 4 | Support | `a` nav item | `href="#"`; hover classes |
| 5 | New Project | `button` | Classes include `bg-primary hover:bg-primary-container`; no `onclick` |
| 6 | Notifications | `button` | Icon `data-icon="notifications"`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 7 | Settings | `button` | Icon `data-icon="settings"`; classes include `hover:bg-canvas-soft`; no `onclick` |
| 8 | Upload dropzone: `UPLOAD_INPUT.MP4` | Clickable dropzone `div` | Classes include `cursor-pointer group hover:border-outline-variant`; text says `Drag and drop video file here or click to browse`; no `<input type="file">` present |
| 9 | Proceed to Compiler | `button` | Icon `arrow_forward`; disabled-looking visual state `opacity-50 cursor-not-allowed`; no `disabled` attribute |
| 10 | API | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 11 | Legal | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 12 | Privacy | `a` footer link | `href="#"`; classes include `hover:text-primary` |
| 13 | GitHub | `a` footer link | `href="#"`; classes include `hover:text-primary` |

Embedded CSS/JS purpose: Tailwind CDN config defines theme tokens; inline style sets Material Symbols font variation.

## CSS/JS Files

No standalone `.css` or `.js` files were extracted.

Embedded CSS/JS by file:

| Path | One-line purpose |
|---|---|
| `admin_audit_log/code.html` | Self-contained screen using Tailwind CDN config for colors, typography, spacing, radius tokens plus a small body color style. |
| `admin_quarantine/code.html` | Self-contained screen using Tailwind CDN config and inline CSS for font/icon setup. |
| `admin_receipt_chain/code.html` | Self-contained screen using Tailwind CDN config and inline CSS for Inter body font. |
| `admin_sign_in/code.html` | Self-contained screen using Tailwind CDN config; no custom behavior script. |
| `admin_tenants/code.html` | Self-contained screen using Tailwind CDN config, inline CSS for scrollbars/icons, and inline JS `toggleDetails(show)` for drawer state. |
| `job_queue_delivery/code.html` | Self-contained screen using Tailwind CDN config and inline CSS for body colors/custom scrollbars. |
| `ref_studio_landing/code.html` | Self-contained landing page using Tailwind CDN config and inline body font CSS. |
| `scene_review_approval/code.html` | Self-contained workflow screen using Tailwind CDN config and inline CSS for body colors/custom scrollbars. |
| `upload_validation/code.html` | Self-contained upload screen using Tailwind CDN config and inline icon style CSS. |

External resources used by HTML files:

| Resource | Purpose |
|---|---|
| `https://cdn.tailwindcss.com?plugins=forms,container-queries` | Runtime Tailwind utility styling and form/container-query plugin support. |
| Google Fonts CSS URLs | Load Inter, Manrope, Geist/Geist Mono/JetBrains Mono fallback fonts, and Material Symbols. |
| `//local.adguard.org?...` scripts | Injected AdGuard content/user scripts preserved in exported HTML; not application behavior. |

## Design Token / Style Files

### `stitch_design_system_ui_implementation/cosmic_engineering/DESIGN.md`

Token categories present:

| Category | Notes |
|---|---|
| Colors | Surface, canvas, primary/secondary/tertiary, error, outline, body, hairline, accent sunset/dusk/breeze palettes. |
| Typography/fonts | Display, headline, body, caption mono, and button text styles using Manrope/Inter/Geist plus Universal Sans-inspired analysis. |
| Spacing | `xxs`, `xs`, `sm`, `md`, `lg`, `xl`, `2xl`, `3xl`, `4xl`. |
| Radius | Small/default/md/lg/xl/full and alternate none/sm/pill/full definitions. |
| Components | Nav bar/link, buttons, text input, cards, hero/content bands, eyebrow mono, divider, footer. |

## README / Docs Verbatim Contents

Only one markdown documentation/design-token file was present.

### `stitch_design_system_ui_implementation/cosmic_engineering/DESIGN.md`

```markdown
---
name: Cosmic Engineering
colors:
  surface: '#141313'
  surface-dim: '#141313'
  surface-bright: '#3a3939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1c1b1b'
  surface-container: '#201f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353434'
  on-surface: '#e5e2e1'
  on-surface-variant: '#c4c7c8'
  inverse-surface: '#e5e2e1'
  inverse-on-surface: '#313030'
  outline: '#8e9192'
  outline-variant: '#444748'
  surface-tint: '#c6c6c7'
  primary: '#ffffff'
  on-primary: '#2f3131'
  primary-container: '#e2e2e2'
  on-primary-container: '#636565'
  inverse-primary: '#5d5f5f'
  secondary: '#c3c7cd'
  on-secondary: '#2c3136'
  secondary-container: '#43474d'
  on-secondary-container: '#b2b5bc'
  tertiary: '#ffffff'
  on-tertiary: '#2f3131'
  tertiary-container: '#e2e2e2'
  on-tertiary-container: '#636565'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c7'
  on-primary-fixed: '#1a1c1c'
  on-primary-fixed-variant: '#454747'
  secondary-fixed: '#dfe3e9'
  secondary-fixed-dim: '#c3c7cd'
  on-secondary-fixed: '#181c21'
  on-secondary-fixed-variant: '#43474d'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c7'
  on-tertiary-fixed: '#1a1c1c'
  on-tertiary-fixed-variant: '#454747'
  background: '#141313'
  on-background: '#e5e2e1'
  surface-variant: '#353434'
  canvas: '#0a0a0a'
  canvas-soft: '#1a1c20'
  canvas-card: '#191919'
  hairline: '#212327'
  ink: '#ffffff'
  body: '#dadbdf'
  sunset: '#ff7a17'
  dusk: '#7c3aed'
  breeze: '#a0c3ec'
typography:
  display-xl:
    fontFamily: manrope
    fontSize: 96px
    fontWeight: '400'
    lineHeight: 96px
    letterSpacing: -2.4px
  display-lg:
    fontFamily: manrope
    fontSize: 72px
    fontWeight: '400'
    lineHeight: 72px
    letterSpacing: -1.8px
  display-md:
    fontFamily: manrope
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 48px
    letterSpacing: -1.2px
  display-sm:
    fontFamily: manrope
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 36px
    letterSpacing: -0.6px
  headline-lg-mobile:
    fontFamily: manrope
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -1px
  body-lg:
    fontFamily: inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  caption-mono:
    fontFamily: geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 1.4px
  caption-mono-sm:
    fontFamily: geist
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 1.2px
  button:
    fontFamily: inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 64px
---

---
version: alpha
name: xAI-Inspired-design-analysis
description: An inspired interpretation of xAI's design language — Elon Musk's frontier-AI company whose web surface is a strict near-black canvas broken only by white pill outlines, occasional warm sunset / dusk gradient accents, a custom geometric sans (Universal Sans) for display, and an uppercase tracked monospace caption face; the whole system reads as engineered-cosmic, unmarketed.

colors:
  primary: "#ffffff"
  on-primary: "#0a0a0a"
  ink: "#ffffff"
  ink-hover: "#fafaf7"
  body: "#dadbdf"
  body-mid: "#7d8187"
  mute: "#7d8187"
  hairline: "#212327"
  canvas: "#0a0a0a"
  canvas-soft: "#1a1c20"
  canvas-card: "#191919"
  canvas-mid: "#363a3f"
  accent-sunset: "#ff7a17"
  accent-sunset-soft: "#ffc285"
  accent-dusk: "#7c3aed"
  accent-twilight: "#c4b5fd"
  accent-breeze: "#a0c3ec"
  accent-midnight: "#0d1726"

typography:
  display-xl:
    fontFamily: universalSans, Inter, system-ui, -apple-system, sans-serif
    fontSize: 96px
    fontWeight: 400
    lineHeight: 96px
    letterSpacing: -2.4px
  display-lg:
    fontFamily: universalSans, Inter, system-ui, sans-serif
    fontSize: 72px
    fontWeight: 400
    lineHeight: 72px
    letterSpacing: -1.8px
  display-md:
    fontFamily: universalSans, Inter, system-ui, sans-serif
    fontSize: 48px
    fontWeight: 400
    lineHeight: 48px
    letterSpacing: -1.2px
  display-sm:
    fontFamily: universalSans, Inter, system-ui, sans-serif
    fontSize: 32px
    fontWeight: 400
    lineHeight: 36px
    letterSpacing: -0.6px
  display-xs:
    fontFamily: universalSans, Inter, system-ui, sans-serif
    fontSize: 20px
    fontWeight: 400
    lineHeight: 28px
  body-lg:
    fontFamily: universalSans, Inter, system-ui, sans-serif
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  body-md:
    fontFamily: universalSans, Inter, system-ui, sans-serif
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
  body-sm:
    fontFamily: universalSans, Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  caption-mono:
    fontFamily: GeistMono, ui-monospace, SFMono-Regular, Menlo, Monaco, monospace
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 1.4px
  caption-mono-sm:
    fontFamily: GeistMono, ui-monospace, SFMono-Regular, Menlo, monospace
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 1.2px
  button-md:
    fontFamily: universalSans, Inter, system-ui, sans-serif
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px

rounded:
  none: 0px
  sm: 8px
  pill: 9999px
  full: 9999px

spacing:
  xxs: 2px
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
  2xl: 32px
  3xl: 48px
  4xl: 64px

components:
  nav-bar:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    padding: "{spacing.md} {spacing.xl}"
  nav-link:
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    borderColor: "{colors.primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.md}"
  button-outline-on-dark:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "{spacing.sm} {spacing.lg}"
  button-outline-sm:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: "{spacing.xs} {spacing.md}"
  text-input:
    backgroundColor: "{colors.canvas-soft}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.md} {spacing.lg}"
  card-content:
    backgroundColor: "{colors.canvas-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xl}"
  card-feature-product:
    backgroundColor: "{colors.canvas-card}"
    textColor: "{colors.ink}"
    borderColor: "{colors.hairline}"
    typography: "{typography.body-md}"
    rounded: "{rounded.sm}"
    padding: "{spacing.xl}"
  hero-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-xl}"
    padding: "{spacing.4xl} {spacing.xl}"
  content-band:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.display-md}"
    padding: "{spacing.4xl} {spacing.xl}"
  eyebrow-mono:
    textColor: "{colors.ink}"
    typography: "{typography.caption-mono}"
  divider-hairline:
    borderColor: "{colors.hairline}"
  footer:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-sm}"
    padding: "{spacing.3xl} {spacing.xl}"
```

## Non-HTML Assets

| Path | Purpose |
|---|---|
| `admin_audit_log/screen.png` | Reference screenshot for Admin Audit Log screen. |
| `admin_quarantine/screen.png` | Reference screenshot for Admin Quarantine screen. |
| `admin_receipt_chain/screen.png` | Reference screenshot for Receipt Chain Viewer screen. |
| `admin_sign_in/screen.png` | Reference screenshot for Admin Sign In screen. |
| `admin_tenants/screen.png` | Reference screenshot for Admin Tenants screen. |
| `job_queue_delivery/screen.png` | Reference screenshot for Job Queue & Delivery screen. |
| `ref_studio_landing/screen.png` | Reference screenshot for public/product landing page. |
| `scene_review_approval/screen.png` | Reference screenshot for Scene Review Approval screen. |
| `upload_validation/screen.png` | Reference screenshot for Upload Validation screen. |

## Totals

| Metric | Count |
|---|---:|
| Extracted files, excluding this generated inventory | 19 |
| HTML screen files | 9 |
| PNG reference screenshots | 9 |
| Markdown/docs/design-token files | 1 |
| Standalone CSS files | 0 |
| Standalone JS files | 0 |
| Distinct interactive components inventoried | 151 |

Interactive component count by screen:

| Screen | Count |
|---|---:|
| `admin_audit_log/code.html` | 15 |
| `admin_quarantine/code.html` | 15 |
| `admin_receipt_chain/code.html` | 14 |
| `admin_sign_in/code.html` | 10 |
| `admin_tenants/code.html` | 23 |
| `job_queue_delivery/code.html` | 30 |
| `ref_studio_landing/code.html` | 13 |
| `scene_review_approval/code.html` | 18 |
| `upload_validation/code.html` | 13 |

## Cross-Check: Every Extracted File Accounted For

| File | Covered in report |
|---|---|
| `stitch_design_system_ui_implementation/admin_audit_log/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/admin_audit_log/screen.png` | File tree + non-HTML assets |
| `stitch_design_system_ui_implementation/admin_quarantine/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/admin_quarantine/screen.png` | File tree + non-HTML assets |
| `stitch_design_system_ui_implementation/admin_receipt_chain/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/admin_receipt_chain/screen.png` | File tree + non-HTML assets |
| `stitch_design_system_ui_implementation/admin_sign_in/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/admin_sign_in/screen.png` | File tree + non-HTML assets |
| `stitch_design_system_ui_implementation/admin_tenants/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/admin_tenants/screen.png` | File tree + non-HTML assets |
| `stitch_design_system_ui_implementation/cosmic_engineering/DESIGN.md` | Design-token categories + verbatim docs contents |
| `stitch_design_system_ui_implementation/job_queue_delivery/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/job_queue_delivery/screen.png` | File tree + non-HTML assets |
| `stitch_design_system_ui_implementation/ref_studio_landing/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/ref_studio_landing/screen.png` | File tree + non-HTML assets |
| `stitch_design_system_ui_implementation/scene_review_approval/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/scene_review_approval/screen.png` | File tree + non-HTML assets |
| `stitch_design_system_ui_implementation/upload_validation/code.html` | HTML inventory + embedded CSS/JS purpose |
| `stitch_design_system_ui_implementation/upload_validation/screen.png` | File tree + non-HTML assets |
