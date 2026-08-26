CREATE TABLE job_feedback (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('LOOKS_GOOD', 'NEEDS_CHANGES', 'REQUEST_CHANGES')),
  note TEXT,
  planner_kind TEXT CHECK (planner_kind IN ('ai', 'heuristic')),
  proposals_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX job_feedback_job ON job_feedback(job_id, created_at);
