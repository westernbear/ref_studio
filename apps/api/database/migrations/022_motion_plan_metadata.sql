ALTER TABLE motion_scene_versions ADD COLUMN plan_digest TEXT CHECK (plan_digest IS NULL OR length(plan_digest) = 64 AND plan_digest NOT GLOB '*[^0-9a-f]*');
ALTER TABLE motion_scene_versions ADD COLUMN predecessor_version INTEGER CHECK (predecessor_version IS NULL OR predecessor_version > 0);
ALTER TABLE motion_scene_versions ADD COLUMN artifact_digest TEXT CHECK (artifact_digest IS NULL OR length(artifact_digest) = 64 AND artifact_digest NOT GLOB '*[^0-9a-f]*');
ALTER TABLE motion_scene_versions ADD COLUMN predicate_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(predicate_ids_json) AND json_type(predicate_ids_json) = 'array');
