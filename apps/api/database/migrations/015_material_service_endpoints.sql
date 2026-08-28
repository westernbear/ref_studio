-- Where the two self-hosted generators live. Both ran off worker
-- environment variables (RVS_WAN_ALPHA_BASE_URL, RVS_HI3DGEN_BASE_URL),
-- which meant reaching a worker's shell to change them and no way to see
-- from the console whether either was configured at all. They belong here,
-- beside the 2D image provider's own settings, so all three generators are
-- set in one place.
--
-- Nullable on purpose: unset means "this deployment has no such service",
-- and the provider then refuses that material kind by name rather than
-- failing obscurely.
ALTER TABLE material_provider_settings ADD COLUMN video_base_url TEXT;
ALTER TABLE material_provider_settings ADD COLUMN model3d_base_url TEXT;
