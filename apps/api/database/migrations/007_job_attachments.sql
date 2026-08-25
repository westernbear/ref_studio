CREATE TABLE job_attachments (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX job_attachments_job ON job_attachments(job_id, created_at);
