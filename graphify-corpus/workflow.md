# Creator ingest-to-delivery workflow

This workflow keeps the creator path bounded, editable, recoverable, and
explicit about job state. A successful render is not an approval by itself.

## Inputs (bounded video)

- Accept one local `.mp4` video per job.
- Reject files over 2 GB before upload completes.
- Accept duration from 1 second through 5 minutes; reject shorter or longer
  inputs with a visible validation error.
- Accept constant-frame-rate video at 24, 25, 30, 50, or 60 fps. Reject
  variable-frame-rate input and unsupported frame rates.
- Accept ordinary media only. The user does not need to provide a project file,
  scene graph, or renderer checkpoint.
- Preserve the original upload as the source artifact while the job is active;
  create a normalized working input only after validation succeeds.

## Preview (editable WebGL)

- Show an interactive 9:16 preview using the same semantic DOM/SVG and WebGL2
  scene specification used by the browser worker.
- Keep product UI, typography, timing controls, and WebGL effects editable;
  never replace the authored UI with a captured screenshot.
- Scrubbing selects an exact frame. Preview playback is frame-indexed, so the
  visible result matches the frame sent to render.
- Label the preview as draft until the user approves the current source and
  scene. Disable approval while an input or scene change is being processed.

## Render (browser worker)

1. Validate the bounded input and create a queued job.
2. Compile the editable scene from the approved workflow data.
3. A pinned browser worker renders frames from the frame-indexed scene, then
   assembles the video and audio delivery output.
4. Run delivery checks for frame count, dimensions, playable media, and audio
   presence before marking the job complete.
5. Publish only the completed artifact and its human-readable render report;
   keep intermediate files private to the job.

The worker must stop with a visible error rather than silently substituting a
fallback renderer, missing font, or unconsumed effect.

## Retry / Cancellation

- A transient worker or upload failure is retryable. Retry resumes from the
  latest safe job boundary and does not create a second user-visible job.
- Allow at most three automatic retries, with a manual **Retry** action after
  that limit. Validation and stale-approval failures are not retryable until
  the user changes or re-approves the relevant input.
- **Cancel** is available while a job is `QUEUED`, `PREPARING`, or `RENDERING`.
  Cancellation requests stop new work, mark the job `CANCEL_REQUESTED`, and
  finish as `CANCELLED` after the worker acknowledges it.
- A completed or cancelled job cannot be resumed in place; use Retry to create
  a new attempt linked to the same creator job.

## Visible Errors

Errors are shown beside the affected job with a plain-language cause and next
action. Examples:

- “This file is larger than 2 GB. Choose a smaller MP4.”
- “Use a constant frame rate of 24, 25, 30, 50, or 60 fps.”
- “The render worker stopped temporarily. Retry now.”
- “Render cancelled. Your source is still available.”
- “This approval is stale because the source or scene changed. Review and
  approve the current preview before rendering.”

The UI must distinguish validation, transient infrastructure, cancellation,
and stale-approval errors. Do not expose a successful-looking download for a
failed or partial render.

## Stale Approval Recovery

- Record which source version and editable scene an approval applies to using
  ordinary job metadata, not a hash gate.
- Any source replacement, trim, fps change, or editable scene change invalidates
  the pending approval before render starts.
- If a stale approval is detected, move the job to `STALE_APPROVAL`, preserve
  the prior preview as history, and block render and publish.
- Show the changed input and current editable preview. The user must review and
  explicitly re-approve the current version.
- On re-approval, create a new approval event, return the job to `READY`, and
  allow render. A failed stale-approval recovery must exit with
  `STALE_APPROVAL_UNSAFE`, never silently reuse the old approval.

## Artifact Lifecycle

### Create

Create artifacts in this order: validated source, normalized working input,
editable scene checkpoint, preview snapshot, render intermediates, delivery
video, and render report. Each artifact is associated with the creator job and
its current attempt.

### Retain

- Retain the source, latest editable checkpoint, latest preview, delivery, and
  report for 30 days after the job reaches a terminal state.
- Retain failed-attempt diagnostics for 7 days so Retry and support can explain
  what happened.
- Retain cancelled-job source and checkpoint for 30 days; cancellation does not
  delete user work.
- Show the retention deadline in the job details and offer download before TTL.

### Delete

- After TTL, delete delivery, preview, intermediates, reports, and failed
  diagnostics automatically.
- Delete source and editable checkpoint after TTL unless the user explicitly
  extends retention before expiry.
- Delete abandoned upload parts after 24 hours and failed temporary frames
  after 24 hours.
- Cleanup is idempotent: a missing artifact is treated as already deleted, and
  cleanup failure is visible to operators without resurrecting the job.

## Job States

`UPLOADING` → `VALIDATING` → `PREPARING` → `READY` → `QUEUED` → `RENDERING`
→ `ASSEMBLING` → `COMPLETED`

Alternate transitions:

- `VALIDATING` → `INPUT_INVALID`
- `READY` → `STALE_APPROVAL`
- `QUEUED`/`PREPARING`/`RENDERING` → `CANCEL_REQUESTED` → `CANCELLED`
- `PREPARING`/`RENDERING`/`ASSEMBLING` → `RETRYABLE_ERROR` → `QUEUED`
- Any non-terminal state → `FAILED` for a non-retryable error.
- `COMPLETED`, `CANCELLED`, `FAILED`, and `INPUT_INVALID` are terminal for the
  current attempt. Retry creates a new attempt; it does not mutate history.
