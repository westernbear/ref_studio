import { describe, expect, it } from "vitest";
import { generateVerifiedScene } from "./verified-scene-authoring.js";
import { verifyAndRepair } from "./verified-scene-authoring.js";
import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";

describe("verified scene authoring", () => {
  it("repairs at most four times and returns only a verified candidate", async () => {
    const attempts: number[] = [];
    const result = await generateVerifiedScene({
      generate: async (attempt) => {
        attempts.push(attempt);
        return attempt;
      },
      verify: (candidate) => {
        if (candidate !== 4) throw new Error("predicate failed");
        return candidate;
      },
    });
    expect(result).toEqual({
      value: 4,
      attempts: 4,
      failures: ["predicate failed", "predicate failed", "predicate failed"],
    });
    expect(attempts).toEqual([1, 2, 3, 4]);
  });

  it("passes concrete failures to the next repair attempt", async () => {
    const received: string[][] = [];
    const result = await generateVerifiedScene({
      generate: async (attempt, failures) => {
        received.push([...failures]);
        return attempt;
      },
      verify: (candidate) => {
        if (candidate === 1) throw new Error("MOTION_PLAN_UNKNOWN_ELEMENT");
        return candidate;
      },
    });

    expect(received).toEqual([[], ["MOTION_PLAN_UNKNOWN_ELEMENT"]]);
    expect(result.attempts).toBe(2);
    expect(result.failures).toEqual(["MOTION_PLAN_UNKNOWN_ELEMENT"]);
  });

  it("fails after four attempts", async () => {
    let attempts = 0;
    await expect(
      generateVerifiedScene({
        generate: async () => {
          attempts += 1;
          return null;
        },
        verify: () => {
          throw new Error("predicate failed");
        },
      }),
    ).rejects.toThrow(/SCENE_VERIFICATION_FAILED/u);
    expect(attempts).toBe(4);
  });

  it("preserves the safe scene and artifact with actual findings after attempt four", async () => {
    const seen: string[][] = [];
    const result = await verifyAndRepair({
      initialScene: { version: 0 },
      initialArtifact: "safe.mp4",
      verify: (scene, attempt) => ({
        schema: "verification-report-v1",
        sceneDigest: sha256Hex(scene),
        attempts: attempt,
        status: "FAIL",
        findings: [
          {
            predicateId: "frame-hash-deterministic",
            pass: false,
            target: "frames",
            observed: `mismatch-${attempt}`,
            expected: "equal hashes",
            remediation: "rerender",
          },
        ],
      }),
      repair: async (scene, findings) => {
        seen.push(
          findings.map(
            (finding) => `${finding.predicateId}:${finding.observed}`,
          ),
        );
        return {
          scene: { version: scene.version + 1 },
          artifact: "unsafe.mp4",
        };
      },
    });
    expect(seen).toEqual([
      ["frame-hash-deterministic:mismatch-1"],
      ["frame-hash-deterministic:mismatch-2"],
      ["frame-hash-deterministic:mismatch-3"],
    ]);
    expect(result).toMatchObject({
      scene: { version: 0 },
      artifact: "safe.mp4",
      preserved: true,
      report: { attempts: 4, status: "FAIL" },
    });
    expect(result.report.findings[0]?.observed).toBe("mismatch-4");
  });

  it.each(["cancel", "timeout", "stale"])(
    "preserves safe state on %s",
    async (reason) => {
      const controller = new AbortController();
      if (reason === "cancel") controller.abort();
      const result = await verifyAndRepair({
        initialScene: "safe",
        initialArtifact: "safe-artifact",
        signal: controller.signal,
        deadlineAt: reason === "timeout" ? 1 : undefined,
        now: () => 2,
        isStale: () => reason === "stale",
        verify: () => {
          throw new Error("must not verify");
        },
        repair: async () => {
          throw new Error("must not repair");
        },
      });
      expect(result).toMatchObject({
        scene: "safe",
        artifact: "safe-artifact",
        preserved: true,
        report: { status: "FAIL", attempts: 1 },
      });
      expect(result.report.findings[0]?.observed).toContain(
        reason === "cancel" ? "cancelled" : reason,
      );
    },
  );
});
