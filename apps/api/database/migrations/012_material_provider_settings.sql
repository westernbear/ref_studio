-- A separate row from ai_provider_settings on purpose: a studio may use one
-- vendor for scene authoring and a different one for generated image/video/
-- font material, so the two must be configurable independently.
CREATE TABLE material_provider_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  provider_kind TEXT NOT NULL CHECK (provider_kind IN ('openai')),
  model TEXT NOT NULL,
  api_key_ciphertext TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
