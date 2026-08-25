CREATE TABLE ai_provider_settings (
  id TEXT PRIMARY KEY CHECK (id = 'default'),
  provider_kind TEXT NOT NULL CHECK (provider_kind IN (
    'openai', 'anthropic', 'google', 'xai', 'groq', 'mistral', 'cohere',
    'deepseek', 'cerebras', 'perplexity', 'fireworks', 'togetherai',
    'deepinfra', 'baseten', 'huggingface', 'moonshotai', 'alibaba',
    'openai-compatible'
  )),
  model TEXT NOT NULL,
  base_url TEXT,
  api_key_ciphertext TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE job_ratings (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  creator_id TEXT NOT NULL,
  thumbs_up INTEGER NOT NULL CHECK (thumbs_up IN (0, 1)),
  created_at TEXT NOT NULL
);
CREATE INDEX job_ratings_job ON job_ratings(job_id, created_at);
