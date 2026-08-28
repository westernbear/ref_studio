-- Brand attachments (logos, product shots, fonts) that a generate-track
-- brief references by id. These lived only in an in-memory Map, so an API
-- restart between the upload and the assets stage lost every one of them
-- while the job that referenced them survived -- ten minutes of analysis,
-- compilation and preview, then ATTACHMENT_UNRESOLVED.
--
-- filename is here because the scene author needs it. A brief says "use
-- 05_ranking.jpg for the ranking beat"; without the name, the model sees
-- twenty interchangeable ids and cannot honour that.
--
-- Bytes live on disk at storage_path, next to artifacts and job
-- attachments; this table holds only metadata, so the durable-state
-- snapshot stays cheap to rewrite.
CREATE TABLE runtime_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX runtime_attachments_tenant ON runtime_attachments(tenant_id, created_at);
