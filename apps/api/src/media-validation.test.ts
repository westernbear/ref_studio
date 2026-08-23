import { describe, expect, it } from "vitest"
import { exactSourceInterval, MEDIA_LIMITS, mediaCommands, MediaValidationFailure, SANDBOX_POLICY, validateAndNormalize, type MediaProbe, type MediaSandboxRunner } from "./media-validation.js"
import type { UploadRecord } from "./uploads.js"

const upload = (sizeBytes = 100): UploadRecord => ({ id: "upl_media", tenantId: "ten_a", filename: "source.mp4", contentType: "video/mp4", sizeBytes, state: "ACCEPTED", createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2026-01-02T00:00:00.000Z", casObjectId: "cas_source", chunks: [], actualBytes: sizeBytes })
const probe = (overrides: Partial<MediaProbe> = {}): MediaProbe => ({ container: "mp4", codec: "h264", durationSeconds: 4, avgFrameRate: 30, realFrameRate: 30, frameCount: 120, width: 1920, height: 1080, rotationDegrees: 0, hasAudio: true, metadataSafe: true, ...overrides })
const runner = (value: MediaProbe, options: { readonly fail?: MediaValidationFailure } = {}): MediaSandboxRunner => ({ run: async () => { if (options.fail) throw options.fail; return { policy: SANDBOX_POLICY, probe: value, normalizedSha256: "normalized_digest", normalizedBytes: 100 } } })

describe("media-validation", () => {
  it.each([24, 25, 30, 50, 60] as const)("accepts CFR %d fps and exact source frames", async (fps) => {
    const result = await validateAndNormalize(upload(), "source_digest", runner(probe({ avgFrameRate: fps, realFrameRate: fps, frameCount: fps * 4 })))
    expect(result.fps).toBe(fps); expect(result.frameCount).toBe(fps * 4); expect(result.interval.endFrameExclusive).toBe(fps * 4)
  })
  it.each([{ name: "VFR", patch: { avgFrameRate: 30, realFrameRate: 29.97 } }, { name: "unsupported fps", patch: { avgFrameRate: 23, realFrameRate: 23 } }])("rejects $name", async ({ patch }) => { await expect(validateAndNormalize(upload(), "source_digest", runner(probe(patch)))).rejects.toMatchObject({ code: patch.avgFrameRate === patch.realFrameRate ? "MEDIA_FPS_UNSUPPORTED" : "MEDIA_VFR_UNSUPPORTED" }) })
  it.each([
    { patch: { durationSeconds: 0.5 }, code: "MEDIA_DURATION_INVALID" },
    { patch: { durationSeconds: 301 }, code: "MEDIA_DURATION_INVALID" },
    { patch: { container: "avi" }, code: "MEDIA_CONTAINER_INVALID" },
    { patch: { codec: "vp9" }, code: "MEDIA_CODEC_INVALID" },
    { patch: { width: 3841 }, code: "MEDIA_DIMENSIONS_INVALID" },
    { patch: { metadataSafe: false }, code: "MEDIA_METADATA_INVALID" },
  ])("rejects invalid media metadata", async ({ patch, code }) => { await expect(validateAndNormalize(upload(), "source_digest", runner(probe(patch)))).rejects.toMatchObject({ code }) })
  it("rejects oversized upload and out-of-bounds half-open interval", async () => { await expect(validateAndNormalize(upload(MEDIA_LIMITS.maxBytes + 1), "source_digest", runner(probe()))).rejects.toMatchObject({ code: "MEDIA_SIZE_LIMIT_EXCEEDED" }); await expect(validateAndNormalize(upload(), "source_digest", runner(probe()), 1)).rejects.toMatchObject({ code: "MEDIA_INTERVAL_INVALID" }) })
  it("preserves source provenance, rotation fit, and synthesizes exact silence metadata", async () => { const result = await validateAndNormalize(upload(), "source_digest", runner(probe({ rotationDegrees: 90, hasAudio: false }))); expect(result.sourceImmutable).toBe(true); expect(result.sourceSha256).toBe("source_digest"); expect(result.sourceCasObjectId).toBe("cas_source"); expect(result.normalizedCasObjectId).toBe("norm_normalized_digest"); expect(result.landscapeFit).toEqual({ width: 1080, height: 1920, rotated: true }); expect(result.audio).toEqual({ sampleRateHz: 48000, channels: 2, synthesizedSilence: true }) })
  it("exposes only argument arrays and sandbox limits", () => { const commands = mediaCommands("upl_media"); expect(commands.every((item) => Array.isArray(item.args) && item.timeoutMilliseconds === SANDBOX_POLICY.maxWallMilliseconds && item.outputCapBytes === SANDBOX_POLICY.maxOutputBytes)).toBe(true); expect(SANDBOX_POLICY).toMatchObject({ uid: 65532, network: false, readOnlyRoot: true, noNewPrivileges: true, seccomp: true, tenantStagingMounts: 1 }) })
  it.each(["MEDIA_SANDBOX_TIMEOUT", "MEDIA_SANDBOX_OUTPUT_LIMIT"] as const)("returns stable sandbox failure %s", async (code) => { await expect(validateAndNormalize(upload(), "source_digest", runner(probe(), { fail: new MediaValidationFailure(code) }))).rejects.toMatchObject({ code }) })
  it("rejects normalized output over the sandbox cap", async () => { const oversized: MediaSandboxRunner = { run: async () => ({ policy: SANDBOX_POLICY, probe: probe(), normalizedSha256: "x", normalizedBytes: SANDBOX_POLICY.maxOutputBytes + 1 }) }; await expect(validateAndNormalize(upload(), "source_digest", oversized)).rejects.toMatchObject({ code: "MEDIA_SANDBOX_OUTPUT_LIMIT" }) })
  it("rejects quarantined media without invoking runner", async () => { const rejected = { ...upload(), state: "QUARANTINED" as const }; let called = false; const sandbox: MediaSandboxRunner = { run: async () => { called = true; return { policy: SANDBOX_POLICY, probe: probe(), normalizedSha256: "x", normalizedBytes: 1 } } }; await expect(validateAndNormalize(rejected, "source_digest", sandbox)).rejects.toMatchObject({ code: "MEDIA_NOT_ACCEPTED" }); expect(called).toBe(false) })
  it("uses half-open exact bounds", () => { expect(exactSourceInterval(0, 24, 96).endFrameExclusive).toBe(96); expect(() => exactSourceInterval(1, 24, 96)).toThrowError(new MediaValidationFailure("MEDIA_INTERVAL_INVALID")) })
})
