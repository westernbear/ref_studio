-- A second way to authenticate the 2D image generator: the ChatGPT OAuth
-- credentials the Codex CLI writes to ~/.codex/auth.json, instead of a
-- platform API key. The whole auth.json goes into api_key_ciphertext --
-- it is a secret string like any other, and the encryption, the "is it
-- set" projection, and the console field all already exist for one.
--
-- SQLite cannot alter a CHECK constraint in place, so the table is rebuilt.
-- Rows are carried over unchanged; the only difference is the widened list.
CREATE TABLE material_provider_settings_new (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('openai', 'codex-oauth')),
  model TEXT NOT NULL,
  api_key_ciphertext TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  video_base_url TEXT,
  model3d_base_url TEXT,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
INSERT INTO material_provider_settings_new
  (id, provider_kind, model, api_key_ciphertext, enabled, video_base_url, model3d_base_url, updated_at, updated_by)
SELECT id, provider_kind, model, api_key_ciphertext, enabled, video_base_url, model3d_base_url, updated_at, updated_by
  FROM material_provider_settings;
DROP TABLE material_provider_settings;
ALTER TABLE material_provider_settings_new RENAME TO material_provider_settings;
