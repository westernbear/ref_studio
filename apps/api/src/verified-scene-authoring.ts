import { sha256Hex } from "../../../packages/contracts/src/canonical-json.js";
import type { VerificationReportV1 } from "../../../packages/contracts/src/motion.js";

const failureFinding = (
  observed: string,
): VerificationReportV1["findings"][number] => ({
  predicateId: "scene-spec",
  pass: false,
  target: "scene",
  observed,
  expected: "verification pass",
  remediation: "repair the reported predicate failure",
});

export async function verifyAndRepair<T, A = undefined>(options: {
  readonly initialScene: T;
  readonly initialArtifact: A;
  readonly verify: (
    scene: T,
    attempt: number,
  ) => Promise<VerificationReportV1> | VerificationReportV1;
  readonly repair: (
    scene: T,
    findings: VerificationReportV1["findings"],
    attempt: number,
  ) => Promise<Readonly<{ scene: T; artifact: A }>>;
  readonly signal?: AbortSignal;
  readonly deadlineAt?: number;
  readonly isStale?: () => boolean;
  readonly now?: () => number;
}): Promise<
  Readonly<{
    scene: T;
    artifact: A;
    report: VerificationReportV1;
    preserved: boolean;
  }>
> {
  let candidate = options.initialScene;
  let artifact = options.initialArtifact;
  let lastFindings: VerificationReportV1["findings"] = [];
  const now = options.now ?? Date.now;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const interruption = options.signal?.aborted
      ? "verification cancelled"
      : options.deadlineAt !== undefined && now() >= options.deadlineAt
        ? "verification timeout"
        : options.isStale?.()
          ? "stale scene digest"
          : undefined;
    if (interruption) {
      lastFindings = [failureFinding(interruption)];
      return {
        scene: options.initialScene,
        artifact: options.initialArtifact,
        report: {
          schema: "verification-report-v1",
          sceneDigest: sha256Hex(options.initialScene),
          attempts: attempt,
          status: "FAIL",
          findings: lastFindings,
        },
        preserved: true,
      };
    }
    try {
      const report = await options.verify(candidate, attempt);
      lastFindings = report.findings;
      const passed = report.findings.every((finding) => finding.pass);
      if (
        passed &&
        !options.signal?.aborted &&
        !(options.deadlineAt !== undefined && now() >= options.deadlineAt) &&
        !options.isStale?.()
      )
        return {
          scene: candidate,
          artifact,
          report: { ...report, attempts: attempt },
          preserved: false,
        };
      if (passed)
        lastFindings = [
          failureFinding(
            options.signal?.aborted
              ? "verification cancelled"
              : options.isStale?.()
                ? "stale scene digest"
                : "verification timeout",
          ),
        ];
    } catch (error) {
      lastFindings = [
        failureFinding(
          error instanceof Error ? error.message : "verification failed",
        ),
      ];
    }
    if (attempt < 4) {
      try {
        const repaired = await options.repair(
          candidate,
          lastFindings,
          attempt + 1,
        );
        candidate = repaired.scene;
        artifact = repaired.artifact;
      } catch (error) {
        lastFindings = [
          failureFinding(
            error instanceof Error ? error.message : "repair failed",
          ),
        ];
        return {
          scene: options.initialScene,
          artifact: options.initialArtifact,
          report: {
            schema: "verification-report-v1",
            sceneDigest: sha256Hex(options.initialScene),
            attempts: attempt,
            status: "FAIL",
            findings: lastFindings,
          },
          preserved: true,
        };
      }
    }
  }
  return {
    scene: options.initialScene,
    artifact: options.initialArtifact,
    report: {
      schema: "verification-report-v1",
      sceneDigest: sha256Hex(options.initialScene),
      attempts: 4,
      status: "FAIL",
      findings: lastFindings,
    },
    preserved: true,
  };
}

export async function generateVerifiedScene<T>(options: {
  readonly generate: (
    attempt: number,
    failures: readonly string[],
  ) => Promise<unknown>;
  readonly verify: (candidate: unknown) => T;
}): Promise<{
  readonly value: T;
  readonly attempts: number;
  readonly failures: readonly string[];
}> {
  const failureHistory: string[] = [];
  let initial: unknown = null;
  let initialError: string | undefined;
  try {
    initial = await options.generate(1, []);
  } catch (error) {
    initialError = error instanceof Error ? error.message : "SCENE_INVALID";
  }
  const result = await verifyAndRepair<unknown>({
    initialScene: initial,
    initialArtifact: undefined,
    verify: (candidate, attempt) => {
      try {
        if (initialError !== undefined) {
          const message = initialError;
          initialError = undefined;
          throw new Error(message);
        }
        options.verify(candidate);
        return {
          schema: "verification-report-v1",
          sceneDigest: sha256Hex(candidate),
          attempts: attempt,
          status: "PASS",
          findings: [],
        };
      } catch (verifyError) {
        const message =
          verifyError instanceof Error ? verifyError.message : "SCENE_INVALID";
        failureHistory.push(message);
        return {
          schema: "verification-report-v1",
          sceneDigest: sha256Hex(candidate),
          attempts: attempt,
          status: "FAIL",
          findings: [failureFinding(message)],
        };
      }
    },
    repair: async (_candidate, findings, attempt) => ({
      scene: await options.generate(
        attempt,
        findings.map((entry) => entry.observed),
      ),
      artifact: undefined,
    }),
  });
  if (result.report.status === "FAIL")
    throw new Error(
      `SCENE_VERIFICATION_FAILED: ${result.report.findings.map((entry) => entry.observed).join("; ")}`,
    );
  return {
    value: options.verify(result.scene),
    attempts: result.report.attempts,
    failures: failureHistory,
  };
}
