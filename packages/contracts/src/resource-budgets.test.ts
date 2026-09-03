import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertResourceBudget,
  RESOURCE_BUDGETS,
  ResourceBudgetError,
} from "./resource-budgets.js";
import { redactSensitive } from "./redact.js";
import {
  emitMotionEvent,
  motionObservabilitySnapshot,
  resetMotionObservability,
  sampleMotionMetric,
} from "./motion-observability.js";

describe("resource budgets", () => {
  it("exposes the motion boundary budget matrix", () => {
    expect(RESOURCE_BUDGETS.maxSceneOperations).toBe(64);
    expect(RESOURCE_BUDGETS.maxRelayBodyBytes).toBe(262_144);
    expect(RESOURCE_BUDGETS.maxSpoolFileBytes).toBe(1_048_576);
    expect(RESOURCE_BUDGETS.maxBlenderTriangles).toBe(250_000);
    expect(RESOURCE_BUDGETS.maxFfmpegOutputBytes).toBe(2 * 1024 * 1024 * 1024);
  });

  it("keeps worker ffmpeg and Adobe spool literals in lockstep with the contract", () => {
    const repo = resolve(import.meta.dirname, "../../..");
    const worker = readFileSync(
      resolve(repo, "apps/worker/src/resource-budgets.ts"),
      "utf8",
    );
    const adobe = readFileSync(
      resolve(repo, "integrations/adobe-bridge/src/spool.ts"),
      "utf8",
    );
    expect(worker).toContain(
      "maxFfmpegOutputBytes: 2 * 1024 * 1024 * 1024",
    );
    expect(adobe).toContain("const MAX_FILE_BYTES = 1_048_576");
    expect(RESOURCE_BUDGETS.maxFfmpegOutputBytes).toBe(2 * 1024 * 1024 * 1024);
    expect(RESOURCE_BUDGETS.maxSpoolFileBytes).toBe(1_048_576);
  });

  it("fails closed when a budget is exceeded", () => {
    expect(() =>
      assertResourceBudget(
        "maxSceneOperations",
        RESOURCE_BUDGETS.maxSceneOperations + 1,
      ),
    ).toThrow(ResourceBudgetError);
  });
});

describe("redaction", () => {
  it("redacts secrets, local paths, and AEP names", () => {
    const redacted = redactSensitive({
      authorization: "Bearer secret-token",
      signature: "abc",
      prompt: "open /home/singlerr/private/job.aep please",
      nested: { uploadAuth: "cred", path: "C:\\Users\\rvs\\clip.aep" },
    });
    const encoded = JSON.stringify(redacted);
    expect(encoded).not.toMatch(
      /secret-token|cred|singlerr|Users\\\\rvs|clip\.aep/i,
    );
    expect(encoded).toMatch(/\[redacted]/);
  });
});

describe("motion observability", () => {
  it("emits redacted structured events and metric samples", () => {
    resetMotionObservability();
    emitMotionEvent("lookup.query_class", "cor_obs", {
      queryClass: "exact",
      rawQuery: "secret brief",
      token: "should-hide",
    });
    sampleMotionMetric("four_attempt_failures", 1, {
      path: "/home/singlerr/secret.aep",
    });
    sampleMotionMetric("tthw_ms", 12, { route: "author" });
    sampleMotionMetric("tthw_ms", 40, { route: "author" });
    const snapshot = motionObservabilitySnapshot();
    expect(snapshot.events).toHaveLength(1);
    expect(snapshot.metrics).toHaveLength(3);
    expect(snapshot.histograms).toEqual([
      expect.objectContaining({
        metric: "tthw_ms",
        kind: "histogram",
        count: 2,
        min: 12,
        max: 40,
      }),
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /secret brief|should-hide|singlerr/,
    );
    expect(snapshot.events[0]?.fields).toMatchObject({
      queryClass: "exact",
      rawQuery: "[redacted]",
      token: "[redacted]",
    });
  });
});
