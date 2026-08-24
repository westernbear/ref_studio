ALTER TABLE reviewer_assignments ADD COLUMN release_id TEXT;

CREATE TABLE runtime_uploads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  state TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  value_json TEXT NOT NULL
);
CREATE INDEX runtime_uploads_tenant_created ON runtime_uploads(tenant_id, id);
CREATE INDEX runtime_uploads_expiry ON runtime_uploads(state, expires_at);

CREATE TABLE runtime_upload_chunks (
  upload_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  PRIMARY KEY (upload_id, chunk_index),
  FOREIGN KEY (upload_id) REFERENCES runtime_uploads(id) ON DELETE CASCADE
);

CREATE TABLE runtime_cas_objects (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  storage_path TEXT NOT NULL,
  value_json TEXT NOT NULL,
  UNIQUE (tenant_id, sha256)
);

CREATE TABLE runtime_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  state TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  updated_at TEXT NOT NULL,
  value_json TEXT NOT NULL
);
CREATE INDEX runtime_jobs_queue ON runtime_jobs(state, updated_at, id);
CREATE INDEX runtime_jobs_tenant_created ON runtime_jobs(tenant_id, id);

CREATE TABLE runtime_job_attempts (
  job_id TEXT NOT NULL,
  id TEXT NOT NULL,
  number INTEGER NOT NULL CHECK (number > 0),
  state TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY (job_id, id),
  UNIQUE (job_id, number),
  FOREIGN KEY (job_id) REFERENCES runtime_jobs(id) ON DELETE CASCADE
);

CREATE TABLE runtime_artifacts (
  slot TEXT NOT NULL CHECK (slot IN ('STAGED', 'PREVIEW', 'PUBLISHED')),
  map_key TEXT NOT NULL,
  id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY (slot, map_key),
  FOREIGN KEY (job_id) REFERENCES runtime_jobs(id) ON DELETE CASCADE
);

CREATE TABLE runtime_review_receipts (
  id TEXT PRIMARY KEY,
  release_id TEXT,
  tenant_id TEXT,
  job_id TEXT,
  gate TEXT NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt > 0),
  sequence INTEGER NOT NULL UNIQUE,
  value_json TEXT NOT NULL
);
CREATE INDEX runtime_receipts_job_gate ON runtime_review_receipts(job_id, gate, sequence);
CREATE INDEX runtime_receipts_release_gate ON runtime_review_receipts(release_id, gate, sequence);
CREATE TRIGGER runtime_review_receipts_immutable_update
BEFORE UPDATE ON runtime_review_receipts
BEGIN
  SELECT RAISE(ABORT, 'RECEIPT_IMMUTABLE');
END;
CREATE TRIGGER runtime_review_receipts_immutable_delete
BEFORE DELETE ON runtime_review_receipts
BEGIN
  SELECT RAISE(ABORT, 'RECEIPT_IMMUTABLE');
END;

CREATE TABLE runtime_review_current (
  scope_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL
);

CREATE TABLE runtime_workers (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ONLINE', 'OFFLINE')),
  last_heartbeat INTEGER NOT NULL,
  value_json TEXT NOT NULL
);

CREATE TABLE worker_sessions (
  worker_id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (worker_id) REFERENCES runtime_workers(id) ON DELETE CASCADE
);

CREATE TABLE runtime_job_leases (
  job_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  token_hash TEXT NOT NULL CHECK (length(token_hash) = 64),
  expires_at INTEGER NOT NULL,
  FOREIGN KEY (job_id) REFERENCES runtime_jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (worker_id) REFERENCES runtime_workers(id) ON DELETE CASCADE
);
CREATE INDEX runtime_job_leases_expiry ON runtime_job_leases(expires_at);

CREATE TABLE runtime_idempotency (
  store_name TEXT NOT NULL CHECK (store_name IN ('HTTP', 'WORKFLOW')),
  identity TEXT NOT NULL,
  value_json TEXT NOT NULL,
  PRIMARY KEY (store_name, identity)
);
