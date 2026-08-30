CREATE TABLE motion_provider_canaries (
  tenant_id TEXT NOT NULL CHECK(length(tenant_id) BETWEEN 1 AND 200),
  provider_kind TEXT NOT NULL CHECK(length(provider_kind) BETWEEN 1 AND 100),
  model TEXT NOT NULL CHECK(length(model) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK(status IN ('PASS', 'FAIL')),
  checked_at TEXT NOT NULL,
  tool_schema_digest TEXT NOT NULL CHECK(length(tool_schema_digest) = 64),
  failure_reason TEXT CHECK(failure_reason IS NULL OR length(failure_reason) <= 500),
  PRIMARY KEY (tenant_id, provider_kind, model)
) STRICT;
