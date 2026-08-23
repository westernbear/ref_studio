# SaaS Admin Panel UI/UX Specification

## Purpose and scope

This document specifies only the necessary UI and UX for staff administration of the Reference Video Studio SaaS. It does not define APIs, storage, workers, authorization logic, queue implementation, or rendering behavior.

The admin panel is an operational view of evidence, state, and decisions. It must never suggest that a successful encode equals approval. Unknown, stale, incomplete, or unsafe states stay visible and actionable only through safe, bounded controls.

## Design principles

| Principle | UI rule |
|---|---|
| Evidence-first | Show measured state, source labels, timestamps, confidence, and receipt links before recommendations or actions. |
| Fail-closed messaging | If evidence is missing, stale, quarantined, or ambiguous, show the blocking reason and disable the unsafe action. Never imply success through a green generic status. |
| Tenant clarity | Keep tenant name, job ID, and current scope visible in page headers and detail panels. |
| History is append-only | Present prior attempts and decisions as immutable records. Use “new attempt” language, never “overwrite.” |
| Safe operations | Destructive or consequential actions require confirmation, an explicit reason where appropriate, and a visible result with `correlationId`. |
| Density with hierarchy | Use compact tables for scanning, then a right-side or full-page detail view for evidence and context. |
| Honest status | Separate processing, approval, delivery, quarantine, and error states. Do not collapse them into one progress indicator. |

## Information architecture

```text
Admin shell
├── Dashboard
├── Tenants
├── Jobs
├── Receipts
├── Quarantine
├── Billing
└── Audit
```

### Shell layout

```text
+------------------+----------------------------------------------+
| Brand             | Page title       Scope       User menu     |
| Dashboard         +----------------------------------------------+
| Tenants           | Filters / actions / notices                   |
| Jobs              +----------------------------------------------+
| Receipts          | Main table or list        Detail drawer      |
| Quarantine        |                              or              |
| Billing           |                         Detail page          |
| Audit             |                                              |
+------------------+----------------------------------------------+
```

The sidebar is persistent on desktop and becomes a labeled menu or bottom navigation on narrow screens. The active item is marked by text, icon, and a visible focus-safe indicator, not color alone.

## Shared component specification

| Component | Required behavior |
|---|---|
| Data table | Sortable columns, column labels, keyboard navigation, row selection, responsive stacked-row fallback, and a clear result count. |
| Status badge | Text plus color and icon. Examples: `READY`, `QUEUED`, `RENDERING`, `COMPLETED`, `QUARANTINED`, `FAILED`, `STALE APPROVAL`. |
| Action button | Verb-first label, clear enabled or disabled state, confirmation for cancel, retry, quarantine release, or export. |
| Filter bar | Search, status, tenant, date range, and “clear filters.” Persist filters only within the current view. |
| Detail drawer | Opens without losing table context, has a heading, close button, focus trap, and a direct link to the full detail page when needed. |
| Notice banner | Explains blocking or degraded state in plain language. Include the related job, receipt, or `correlationId` when available. |
| Empty state | Explains why there are no rows and offers one relevant next action. Distinguish “no data” from “filters hide results.” |
| Error state | Names the failed UI operation, preserves the user’s context, offers retry when safe, and shows a safe error code plus `correlationId`. |

## Screen 1: Login

### Layout

Centered sign-in card with product identity, short purpose statement, sign-in fields or approved identity-provider entry point, and a small support footer. No operational data appears before authentication.

### Components

| Component | Specification |
|---|---|
| Identity field | Visible label, autocomplete support, inline validation, no placeholder-only labeling. |
| Secret field | Masked input, show or hide control with accessible label, keyboard-safe submission. |
| Sign-in button | “Sign in”, disabled only while submitting, then returns to a clear result. |
| Error notice | Safe message such as “We couldn’t sign you in. Check your details or contact support.” Never reveal account existence. |
| Support link | Routes to the approved support path without exposing internal diagnostics. |

### States

- Loading: button shows “Signing in…” and prevents duplicate submission.
- Empty: initial form with no error text.
- Error: field-level validation for malformed input, page-level safe error for rejected sign-in, and `correlationId` only when an operational incident exists.

### Interactions and copy

Submit with Enter, preserve entered non-secret values after a recoverable error, and move focus to the first invalid field. Use “Sign in,” not “Authenticate.”

### Responsive and accessibility

Use a single-column layout from 320 px upward, minimum 44 px touch targets, visible focus rings, semantic form labels, error announcements, and sufficient contrast. Do not rely on a background illustration to communicate purpose.

## Screen 2: Tenant List

### Layout

Page header with “Tenants,” search and filters, a compact summary strip, and a data table. Selecting a row opens a detail drawer with tenant name, status, member count, quota summary, recent jobs, and recent audit events.

### Components

| Component | Specification |
|---|---|
| Tenant table | Columns: tenant, status, members, active jobs, quota, last activity. |
| Status badge | `ACTIVE`, `SUSPENDED`, `DELETION PENDING`, or `UNKNOWN`, with explanatory tooltip or text in detail. |
| Row actions | “View tenant” and, where permitted by product policy, “Suspend tenant” with confirmation. |
| Filter bar | Tenant search, status, activity date, and clear filters. |
| Detail drawer | Shows human-readable facts and links to filtered Jobs, Billing, and Audit views. |

### States

- Loading: table skeleton preserves column structure.
- Empty: “No tenants match these filters.” Include “Clear filters.”
- Error: “Tenant list couldn’t be loaded.” Offer retry and show `correlationId` in expandable support details.

### Interactions and copy

Search updates after a deliberate submit or short debounce. Suspending a tenant requires a confirmation dialog that names the tenant and explains the visible consequence. Never expose a raw internal exception.

### Responsive and accessibility

On narrow screens, convert each row to a labeled card with status and primary action first. Tables must have a caption, stable column headers, row focus state, and non-color status labels.

## Screen 3: Job Queue

### Layout

Page header with queue scope and refresh control, filter bar, queue summary, and job table. A selected job opens a detail drawer showing lifecycle, tenant, timestamps, current attempt, safe error, and receipt links.

### Components

| Component | Specification |
|---|---|
| Job table | Columns: job ID, tenant, status, submitted, updated, attempt, current gate, and owner. |
| Status badge | Distinguish `QUEUED`, `RENDERING`, `ASSEMBLING`, `COMPLETED`, `CANCEL REQUESTED`, `CANCELLED`, `RETRYABLE ERROR`, and `FAILED`. |
| Action buttons | “Cancel job” for cancellable states, “Retry” only for retryable states, “View details,” and “Export report” when an approved report exists. |
| Queue summary | Counts by status, with links that apply the matching filter. |
| Detail drawer | Timeline, current blocking message, attempt history, and receipt chain entry points. |

### States

- Loading: table skeleton and “Refreshing queue…” status for assistive technology.
- Empty: “No jobs match these filters.” Distinguish an empty queue from an unavailable queue.
- Error: “Queue data couldn’t be refreshed.” Keep the last known rows visibly labeled as stale, offer retry, and show `correlationId`.

### Interactions and copy

Refresh must not reset filters. Cancel requires confirmation and changes the visible status to `CANCEL REQUESTED` before final completion. Retry starts a new visible attempt and must not rewrite the prior attempt. Use “Retry attempt,” not “Run again” when history matters.

### Responsive and accessibility

Use a responsive row card with status, tenant, updated time, and actions grouped together. Announce status changes without stealing focus. Disable actions with an adjacent explanation, not only a tooltip.

## Screen 4: Receipt Chain Viewer

### Layout

Header with receipt identifier, tenant and job context, chain status, and export action. Main content uses a vertical chain timeline on the left and a selected receipt detail panel on the right. Each node exposes decision, actor, timestamp, predecessor, and artifact references as readable labels.

### Components

| Component | Specification |
|---|---|
| Receipt timeline | Ordered nodes with current, predecessor, and broken-link visual states. |
| Status badge | `APPROVED`, `REJECTED`, `STALE`, `MISSING PREDECESSOR`, or `UNVERIFIED`. |
| Receipt detail | Decision, gate label, actor, time, reason, predecessor link, and provenance paths. |
| Action buttons | “Export receipt chain,” “Copy receipt ID,” and “Open related job.” No edit or delete action. |
| Integrity notice | Plain explanation when the chain is incomplete or cannot be verified by the UI. |

### States

- Loading: timeline placeholders with stable node positions.
- Empty: “No receipts are recorded for this scope.”
- Error: “Receipt chain couldn’t be loaded.” Keep the screen read-only, offer retry, and show `correlationId`.

### Interactions and copy

Selecting a node updates the detail panel and URL-safe selection state. Export confirmation states exactly what is being exported. For a broken chain, say “This chain is incomplete. Approval-dependent actions remain unavailable.”

### Responsive and accessibility

Stack timeline and detail vertically on narrow screens. Provide a list alternative to the visual timeline, headings for each node, keyboard selection, and text labels for every connector state.

## Screen 5: Quarantine Manager

### Layout

Header with “Quarantine,” safety notice, filters, and a table of isolated inputs. The detail drawer shows file identity, tenant, reason, detected type, submitted time, retention state, and review history. High-risk actions are separated from routine viewing.

### Components

| Component | Specification |
|---|---|
| Quarantine table | Columns: item, tenant, reason, status, submitted, retention, and reviewer. |
| Status badge | `QUARANTINED`, `REJECTED`, `REVIEWING`, `RELEASED`, or `EXPIRED`. |
| Action buttons | “View evidence,” “Release” only where explicitly allowed, “Reject,” and “Export review record.” |
| Safety notice | States that isolated input is not available to downstream processing until review is complete. |
| Confirmation dialog | Names the item, tenant, action, and irreversible consequence where applicable. |

### States

- Loading: skeleton table and persistent safety notice.
- Empty: “Quarantine is clear for this scope.” Do not imply that the system has no validation activity.
- Error: “Quarantine items couldn’t be loaded.” Offer retry, preserve filters, and show `correlationId`.

### Interactions and copy

Release and reject actions require explicit confirmation. A failed action leaves the item in its prior visible state and shows a safe error. Use “Input remains isolated,” not “Nothing happened,” when an operation fails.

### Responsive and accessibility

Put reason and status before secondary metadata on narrow screens. Confirmation dialogs must trap focus, support Escape, identify the dangerous action, and never use color as the only warning.

## Screen 6: Audit Log

### Layout

Header with “Audit Log,” immutable-record notice, filters, and a chronological table. Selecting an event opens a detail drawer with event type, actor, tenant, time, target, outcome, reason, and `correlationId`.

### Components

| Component | Specification |
|---|---|
| Audit table | Columns: time, event, actor, tenant, target, outcome, and correlation ID. |
| Outcome badge | `SUCCEEDED`, `DENIED`, `FAILED`, or `STALE`. |
| Filter bar | Event type, actor, tenant, outcome, date range, and text search. |
| Detail drawer | Full human-readable event summary with copyable identifiers. |
| Action buttons | “Export filtered log,” “Copy correlationId,” and “Open related object.” No edit or delete action. |

### States

- Loading: table skeleton with preserved time ordering.
- Empty: “No audit events match these filters.” Include “Clear filters.”
- Error: “Audit events couldn’t be loaded.” Offer retry and show `correlationId`; never replace the log with fabricated or partial success language.

### Interactions and copy

Default sort is newest first. Export respects the active filters and confirms the selected range. Show long identifiers in full in the detail view, with a copy control and accessible success announcement.

### Responsive and accessibility

Use stacked event cards on narrow screens while retaining time, event, outcome, and actor as the first fields. Preserve chronological order in the DOM. Provide table captions, named landmarks, keyboard-accessible drawers, and screen-reader text for abbreviated identifiers.

## Shared content guidance

- Prefer: “The queue could not be refreshed. Retry or contact support with `correlationId` `...`.”
- Avoid: “Something went wrong,” “All good,” or messages that expose stack traces, credentials, tenant internals, or account existence.
- Every operational error should expose a safe stable code only when it helps support, plus a `correlationId` when available.
- Disabled actions need a visible reason, such as “Retry unavailable until the job reaches RETRYABLE ERROR.”
- Use exact state words consistently. Do not use “done” for both completed processing and approved decisions.

## Explicit exclusions

This specification does not include backend logic, API contracts, data schemas, authorization implementation, queue mechanics, storage behavior, compiler behavior, renderer behavior, receipt-writing implementation, or billing calculation rules. It also excludes the creator render canvas, 4-second 1080x1920 preview, diffusion controls, style-generation controls, scene editing, Motion IR editing, WebGL controls, worker controls, and arbitrary code execution controls.
