# Decisions — reference-video-studio-saas

Architectural choices and rationales discovered during work on this plan.

_Auto-scaffolded by /start-work. Append new entries below - never overwrite._

---

- Task 13 keeps mutation state separate from read projections so the in-memory adapter can be replaced without widening admin-read responsibilities; assignment scope is derived from `AuthStore.assignments`, never from request tenant fields.
- Task 14 keeps gate history in a separate injectable store and derives reviewer scope exclusively from server-side `AuthStore.assignments`; changing the current digest snapshot moves the job to `STALE_APPROVAL` and requires a new linked receipt rather than mutating history.
- 2026-08-22 Task 37: the web tenant surface presents the server-derived assignment model as a bounded role selector; viewer state disables mutation controls, while access and suspension require explicit confirmation and preserve before/after audit messaging.
