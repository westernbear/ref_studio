CREATE TABLE runtime_jobs_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  updated_at TEXT NOT NULL,
  value_json TEXT NOT NULL,
  preparation_stage TEXT NOT NULL DEFAULT 'AWAITING_T1'
  CHECK (preparation_stage IN (
    'AWAITING_T1',
    'ANALYSIS_QUEUED',
    'ANALYSIS_RUNNING',
    'COMPILATION_QUEUED',
    'COMPILATION_RUNNING',
    'AWAITING_T2',
    'AWAITING_T3',
    'EVIDENCE_VIDEO_QUEUED',
    'EVIDENCE_VIDEO_RUNNING',
    'PREVIEW_QUEUED',
    'PREVIEW_RUNNING',
    'AWAITING_T4',
    'AUTHORING_QUEUED',
    'AUTHORING_RUNNING',
    'ASSETS_QUEUED',
    'ASSETS_RUNNING',
    'READY'
  )),
  eligible_at INTEGER NOT NULL DEFAULT 0,
  automatic_retries INTEGER NOT NULL DEFAULT 0
  CHECK (automatic_retries >= 0),
  deletion_epoch INTEGER NOT NULL DEFAULT 0
  CHECK (deletion_epoch >= 0),
  restore_epoch INTEGER NOT NULL DEFAULT 0
  CHECK (restore_epoch >= 0)
);
INSERT INTO runtime_jobs_v2 SELECT id, tenant_id, state, attempt, updated_at, value_json,
  preparation_stage, eligible_at, automatic_retries, deletion_epoch, restore_epoch
  FROM runtime_jobs;
DROP TABLE runtime_jobs;
ALTER TABLE runtime_jobs_v2 RENAME TO runtime_jobs;
CREATE INDEX IF NOT EXISTS runtime_jobs_claim_idx
  ON runtime_jobs(state, preparation_stage, eligible_at, updated_at, id);

CREATE TABLE runtime_job_leases_v3 (
  job_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  expires_at INTEGER NOT NULL,
  phase TEXT NOT NULL DEFAULT 'render'
  CHECK (phase IN (
    'analyze',
    'compile',
    'evidence-video',
    'preview',
    'assets',
    'gen-render',
    'render'
  )),
  deletion_epoch INTEGER NOT NULL DEFAULT 0
  CHECK (deletion_epoch >= 0),
  restore_epoch INTEGER NOT NULL DEFAULT 0
  CHECK (restore_epoch >= 0),
  FOREIGN KEY (job_id) REFERENCES runtime_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES runtime_workers(id) ON DELETE CASCADE
);
INSERT INTO runtime_job_leases_v3 SELECT job_id, attempt_id, worker_id, token_hash, expires_at,
  phase, deletion_epoch, restore_epoch
  FROM runtime_job_leases;
DROP TABLE runtime_job_leases;
ALTER TABLE runtime_job_leases_v3 RENAME TO runtime_job_leases;

CREATE TABLE runtime_artifacts_v4 (
  slot TEXT NOT NULL CHECK (slot IN (
    'STAGED',
    'PREVIEW',
    'PUBLISHED',
    'PREVIEW_LABELED',
    'EVIDENCE_VIDEO',
    'SAFETY_SAMPLE',
    'GENERATED_ASSET'
  )),
  map_key TEXT NOT NULL,
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY (slot, map_key),
  FOREIGN KEY (job_id) REFERENCES runtime_jobs(id) ON DELETE CASCADE
);
INSERT INTO runtime_artifacts_v4 SELECT slot, map_key, id, job_id, tenant_id,
  storage_path, value_json
  FROM runtime_artifacts;
DROP TABLE runtime_artifacts;
ALTER TABLE runtime_artifacts_v4 RENAME TO runtime_artifacts;
