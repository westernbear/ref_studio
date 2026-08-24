ALTER TABLE runtime_jobs ADD COLUMN preparation_stage TEXT NOT NULL DEFAULT 'AWAITING_T1'
  CHECK (preparation_stage IN (
    'AWAITING_T1',
    'ANALYSIS_QUEUED',
    'ANALYSIS_RUNNING',
    'COMPILATION_QUEUED',
    'COMPILATION_RUNNING',
    'AWAITING_T2',
    'AWAITING_T3',
    'PREVIEW_QUEUED',
    'PREVIEW_RUNNING',
    'AWAITING_T4',
    'READY'
  ));
ALTER TABLE runtime_jobs ADD COLUMN eligible_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE runtime_jobs ADD COLUMN automatic_retries INTEGER NOT NULL DEFAULT 0
  CHECK (automatic_retries >= 0);
ALTER TABLE runtime_jobs ADD COLUMN deletion_epoch INTEGER NOT NULL DEFAULT 0
  CHECK (deletion_epoch >= 0);
ALTER TABLE runtime_jobs ADD COLUMN restore_epoch INTEGER NOT NULL DEFAULT 0
  CHECK (restore_epoch >= 0);

DROP INDEX runtime_jobs_queue;
CREATE INDEX runtime_jobs_queue
  ON runtime_jobs(state, preparation_stage, eligible_at, updated_at, id);

ALTER TABLE runtime_job_leases ADD COLUMN phase TEXT NOT NULL DEFAULT 'render'
  CHECK (phase IN ('analyze', 'compile', 'preview', 'render'));
ALTER TABLE runtime_job_leases ADD COLUMN deletion_epoch INTEGER NOT NULL DEFAULT 0
  CHECK (deletion_epoch >= 0);
ALTER TABLE runtime_job_leases ADD COLUMN restore_epoch INTEGER NOT NULL DEFAULT 0
  CHECK (restore_epoch >= 0);

CREATE TABLE runtime_release_manifests (
  release_id TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);
