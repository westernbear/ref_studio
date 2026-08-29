CREATE TABLE motion_scene_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  scene_digest TEXT NOT NULL CHECK (length(scene_digest) = 64),
  scene_json TEXT NOT NULL,
  capability_json TEXT NOT NULL,
  verification_json TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, job_id, version),
  UNIQUE (tenant_id, id)
);

CREATE TABLE job_motion_scene_heads (
  tenant_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, job_id),
  FOREIGN KEY (tenant_id, version_id) REFERENCES motion_scene_versions(tenant_id, id)
);

CREATE TRIGGER motion_scene_versions_append_only_update BEFORE UPDATE ON motion_scene_versions BEGIN SELECT RAISE(ABORT,'MOTION_SCENE_VERSION_IMMUTABLE'); END;
CREATE TRIGGER motion_scene_versions_append_only_delete BEFORE DELETE ON motion_scene_versions BEGIN SELECT RAISE(ABORT,'MOTION_SCENE_VERSION_IMMUTABLE'); END;
