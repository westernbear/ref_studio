CREATE TABLE adobe_devices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('ENROLLED','REVOKED')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  last_seen_at_ms INTEGER,
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

CREATE TABLE adobe_device_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  not_before_ms INTEGER NOT NULL CHECK (not_before_ms >= 0),
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > not_before_ms),
  revoked_at_ms INTEGER,
  UNIQUE (tenant_id,device_id,id),
  FOREIGN KEY (tenant_id,device_id) REFERENCES adobe_devices(tenant_id,id)
);

CREATE TABLE adobe_relay_nonces (
  key_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  consumed_at_ms INTEGER NOT NULL CHECK (consumed_at_ms >= 0),
  PRIMARY KEY (key_id,nonce),
  FOREIGN KEY (key_id) REFERENCES adobe_device_keys(id)
);

CREATE TABLE adobe_commands (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  command_json TEXT NOT NULL CHECK (json_valid(command_json)),
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  UNIQUE (tenant_id,id),
  FOREIGN KEY (tenant_id,device_id) REFERENCES adobe_devices(tenant_id,id),
  FOREIGN KEY (tenant_id,job_id) REFERENCES jobs(tenant_id,id)
);

CREATE TRIGGER adobe_relay_nonces_immutable_update BEFORE UPDATE ON adobe_relay_nonces BEGIN SELECT RAISE(ABORT,'ADOBE_RELAY_NONCE_IMMUTABLE'); END;
CREATE TRIGGER adobe_relay_nonces_immutable_delete BEFORE DELETE ON adobe_relay_nonces BEGIN SELECT RAISE(ABORT,'ADOBE_RELAY_NONCE_IMMUTABLE'); END;
