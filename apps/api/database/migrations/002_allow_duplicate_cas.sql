CREATE TABLE cas_objects_v2 (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, sha256 TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0), purpose TEXT NOT NULL, retention_until TEXT NOT NULL, UNIQUE (tenant_id,id), FOREIGN KEY (tenant_id) REFERENCES tenants(id));
INSERT INTO cas_objects_v2 SELECT id, tenant_id, sha256, content_type, size_bytes, purpose, retention_until FROM cas_objects;
DROP TABLE cas_objects;
ALTER TABLE cas_objects_v2 RENAME TO cas_objects;
