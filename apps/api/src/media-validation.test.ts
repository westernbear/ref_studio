import { describe, expect, it } from "vitest";
import { isSafeColorTransfer, SANDBOX_POLICY } from "./media-validation.js";

describe("media-validation", () => {
  it("admits untagged 8-bit SDR but not untagged 10-bit media", () => {
    expect(isSafeColorTransfer(undefined, "yuv420p")).toBe(true);
    expect(isSafeColorTransfer(undefined, "yuv420p10le")).toBe(false);
    expect(isSafeColorTransfer("smpte2084", "yuv420p")).toBe(false);
  });
  it("exposes sandbox limits for the live probe", () => {
    expect(SANDBOX_POLICY).toMatchObject({
      uid: 65532,
      network: false,
      readOnlyRoot: true,
      noNewPrivileges: true,
      seccomp: true,
      tenantStagingMounts: 1,
    });
  });
});
