# Error code index

Stable production error codes for Reference Video Studio motion/Adobe paths.

Each API error envelope includes:

- `code`
- `message` (safe, no stack traces)
- `causeCategory`
- `remediation` (one actionable next step)
- `docsUrl` (`/docs/errors#CODE`)
- `correlationId`
- `details`
- optional `safePredecessor` (`sceneVersion` / `sceneDigest` / `artifactId`)

Source of truth: `packages/contracts/src/errors.ts`.

## Motion

| Code                                            | Next step                                       |
| ----------------------------------------------- | ----------------------------------------------- |
| `MOTION_KNOWLEDGE_NOT_FOUND`                    | Edit the brief to a supported domain term       |
| `MOTION_CANARY_REQUIRED` / `EXPIRED` / `FAILED` | Keep Native; re-run canary after provider fix   |
| `MOTION_PLAN_INVALID`                           | Apply field remediations and regenerate         |
| `PLAN_ELEMENT_NOT_FOUND`                        | Create a new plan with known elements           |
| `INVALID_OPERATION`                             | Use an allowlisted JSON pointer                 |
| `INVALID_SCENE`                                 | Keep previous scene; adjust the edit            |
| `VERSION_CONFLICT`                              | Reload current version, then retry              |
| `SCENE_VERIFICATION_FAILED`                     | Repair failed predicates within four attempts   |
| `RESOURCE_BUDGET_EXCEEDED`                      | Reduce elements/operations/frames/package bytes |

## Adobe

| Code                            | Next step                                     |
| ------------------------------- | --------------------------------------------- |
| `ADOBE_RELAY_REPLAY`            | Fresh nonce + request ID                      |
| `ADOBE_COMMAND_REPLAY_MISMATCH` | Do not reuse command ID with new nonce/digest |
| `ADOBE_RELAY_SIGNATURE_INVALID` | Re-enroll device key                          |
| `ADOBE_AE_READBACK_FAILED`      | Inspect working copy, then retry              |
| `ADOBE_CRASH_RECOVERY`          | One serialized retry only                     |

## Full catalog

All codes are defined in `packages/contracts/src/errors.ts` (`ErrorCodes` + `CATALOG`). Prefer that file when extending remediations. This page highlights the motion/Adobe subset operators hit most often.
