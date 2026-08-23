import { z } from "zod";

const Owner = z.object({
  ownerId: z.string(),
  kind: z.string(),
  editable: z.boolean(),
  confidence: z.number().min(0).max(1),
});
const Track = z.object({
  trackId: z.string(),
  owner: z.string(),
  geometryRef: z.string(),
  lifecycle: z.record(z.string(), z.unknown()),
  effects: z.array(z.string()),
});
export const AuthoringIRSchema = z.object({
  schema: z.literal("authoring-ir-v1"),
  versionId: z.string(),
  tenantId: z.string(),
  owners: z.array(Owner),
  editableAssets: z.array(
    z.object({
      assetId: z.string(),
      kind: z.string(),
      editable: z.boolean(),
      owner: z.string(),
    }),
  ),
});
export const SceneIRSchema = z.object({
  schema: z.literal("scene-ir-v1"),
  versionId: z.string(),
  tenantId: z.string(),
  authoringVersionId: z.string(),
  tracks: z.array(Track),
  audio: z.object({ sampleRateHz: z.literal(48000), channels: z.literal(2) }),
});
export const BrowserPassSpecSchema = z.object({
  schema: z.literal("browser-pass-spec-v1"),
  versionId: z.string(),
  tenantId: z.string(),
  sceneVersionId: z.string(),
  passList: z.array(
    z.object({
      passId: z.string(),
      owner: z.string(),
      kind: z.enum(["DOM/SVG", "WebGL2"]),
      shader: z.string().nullable(),
    }),
  ),
  layerOrder: z.array(z.string()),
});
export const EvidenceSchema = z.object({
  schema: z.literal("evidence-v1"),
  id: z.string(),
  tenantId: z.string(),
  owner: z.string(),
  label: z.string(),
  measuredValue: z.string(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
});
export function assertSceneOwners(
  authoring: z.infer<typeof AuthoringIRSchema>,
  scene: z.infer<typeof SceneIRSchema>,
): void {
  const owners = new Set(authoring.owners.map((item) => item.ownerId));
  if (scene.tracks.some((track) => !owners.has(track.owner)))
    throw new Error("OWNER_MISMATCH");
}
