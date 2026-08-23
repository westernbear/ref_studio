# Recovery Runbook

Recovery is tested with `pnpm recovery:test`. It restores only into a new isolated root and rejects in-place restoration and path escapes. The sequence is fixed:

1. Drain claims at a safe boundary and snapshot the database and CAS manifest.
2. Verify source digests before writing the new root.
3. Increment `restoreEpoch` and revoke credentials, sessions, leases, and downloads.
4. Preserve deletion epochs and verify database integrity, receipt sequence, CAS references, and fixed-frame digests.
5. Write an immutable release baseline manifest.
6. Permit release-scoped T6 only after all checks pass.

Audit and receipt history is append-only. Media and export retention does not delete that history. A failed check is a kill point; never repair by restoring over the source root.
