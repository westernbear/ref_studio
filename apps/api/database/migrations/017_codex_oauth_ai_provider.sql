-- The same ChatGPT OAuth credential the image generator already accepts,
-- now also for the chat provider: the whole of ~/.codex/auth.json goes into
-- api_key_ciphertext, which is already an encrypted secret string.
--
-- Chat and image keep separate rows in separate tables on purpose. They are
-- separate connections an operator turns on independently, and one may run
-- on a subscription the other does not.
--
-- SQLite cannot alter a CHECK constraint in place, so the table is rebuilt.
-- Rows are carried over unchanged; the only difference is the widened list.
CREATE TABLE ai_provider_settings_new (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  provider_kind TEXT NOT NULL CHECK (provider_kind IN (
    'openai', 'anthropic', 'google', 'xai', 'groq', 'mistral', 'cohere',
    'deepseek', 'cerebras', 'perplexity', 'fireworks', 'togetherai',
    'deepinfra', 'baseten', 'huggingface', 'moonshotai', 'alibaba',
    'openai-compatible', 'codex-oauth'
  )),
  model TEXT NOT NULL,
  base_url TEXT,
  api_key_ciphertext TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
INSERT INTO ai_provider_settings_new
  (id, provider_kind, model, base_url, api_key_ciphertext, enabled, updated_at, updated_by)
SELECT id, provider_kind, model, base_url, api_key_ciphertext, enabled, updated_at, updated_by
  FROM ai_provider_settings;
DROP TABLE ai_provider_settings;
ALTER TABLE ai_provider_settings_new RENAME TO ai_provider_settings;
