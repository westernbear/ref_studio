import { describe, expect, it } from "vitest";
import { assertLegalTransition, JobStates, transitions } from "./lifecycle.js";
import { normalizeError } from "./errors.js";

describe("canonical lifecycle", () => {
  it.each(
    JobStates.flatMap((from) =>
      transitions[from].map((to) => [from, to] as const),
    ),
  )("allows %s -> %s", (from, to) =>
    expect(() => assertLegalTransition(from, to)).not.toThrow(),
  );
  it.each([
    ["COMPLETED", "RENDERING"],
    ["CANCELLED", "QUEUED"],
    ["FAILED", "PREPARING"],
  ] as const)("rejects %s -> %s", (from, to) =>
    expect(() => assertLegalTransition(from, to)).toThrow(
      "INVALID_JOB_TRANSITION",
    ),
  );
  // A generate-track job's only edit surface is the chat: a creator can ask
  // for a scene patch after the film has already completed, which has to
  // route the job back through the render it already has (see
  // apps/api/src/refine-prompt.ts). COMPLETED is otherwise terminal -- this
  // is the one door back in, and only ever entered by that patch flow.
  it("allows COMPLETED -> QUEUED for a re-render after a scene patch", () =>
    expect(() => assertLegalTransition("COMPLETED", "QUEUED")).not.toThrow());
});
describe("safe errors", () => {
  it("normalizes unknown errors", () => {
    const result = normalizeError(
      new Error("/private/path stack trace"),
      "cor_test",
    );
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(result.causeCategory).toBe("internal");
    expect(result.remediation.length).toBeGreaterThan(0);
    expect(result.docsUrl).toBe("/docs/errors#INTERNAL_ERROR");
    expect(JSON.stringify(result)).not.toMatch(/private|stack trace/);
  });
  it.each([
    "VERSION_CONFLICT",
    "PRECONDITION_REQUIRED",
    "SCENE_VERIFICATION_FAILED",
    "IDEMPOTENCY_CONFLICT",
    "MOTION_KNOWLEDGE_NOT_FOUND",
    "ADOBE_RELAY_REPLAY",
  ] as const)("retains stable motion code %s without diagnostics", (code) => {
    const result = normalizeError(
      new Error(code, { cause: new Error("secret stack") }),
      "cor_motion",
      {
        safePredecessor: {
          sceneVersion: 3,
          sceneDigest: "a".repeat(64),
        },
      },
    );
    expect(result.code).toBe(code);
    expect(result.causeCategory.length).toBeGreaterThan(0);
    expect(result.remediation.length).toBeGreaterThan(0);
    expect(result.docsUrl).toBe(`/docs/errors#${code}`);
    expect(result.safePredecessor?.sceneVersion).toBe(3);
    expect(JSON.stringify(result)).not.toMatch(/secret stack|stack trace/);
  });
});
