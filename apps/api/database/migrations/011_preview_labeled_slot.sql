CREATE TABLE runtime_artifacts_v3 (
  slot TEXT NOT NULL CHECK (slot IN (
    'STAGED',
    'PREVIEW',
    'PUBLISHED',
    'PREVIEW_LABELED',
    'EVIDENCE_VIDEO',
    'SAFETY_SAMPLE'
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
INSERT INTO runtime_artifacts_v3 SELECT slot, map_key, id, job_id, tenant_id,
  storage_path, value_json
  FROM runtime_artifacts;
DROP TABLE runtime_artifacts;
ALTER TABLE runtime_artifacts_v3 RENAME TO runtime_artifacts;
