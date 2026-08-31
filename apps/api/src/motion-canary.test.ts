import { describe, expect, it } from "vitest";
import { openApiDatabase } from "./durable-state.js";
import {
  modelMotionTools,
  MOTION_LOOKUP_TOOL_SCHEMA_DIGEST,
} from "./motion-knowledge.js";
import {
  readMotionToolCanary,
  runMotionToolCanary,
  type MotionCanaryAdapter,
} from "./motion-canary.js";

const validCard = {
  id: "opacity",
  domain: "opacity",
  title_en: "Opacity",
  title_ko: "불투명도",
  definition_en: "Controls visibility.",
  definition_ko: "가시성을 제어한다.",
  distinctions_json: '["opacity is not brightness"]',
  parameters_json: '[{"name":"opacity","unit":"ratio","range":[0,1]}]',
  capabilities_json: '["motion_lookup"]',
  operation_refs_json: '["set_opacity"]',
  verifier_refs_json: '["opacity_range"]',
  sources_json: '["https://example.com/opacity"]',
} as const;

const adapter = (result: unknown): MotionCanaryAdapter => ({
  callTool: async () => result,
});

const identity = {
  tenantId: "tenant-a",
  providerKind: "openai",
  model: "gpt-test",
} as const;

describe("motion provider tool canary", () => {
  it("Given a valid provider result, when the canary runs, then only a fresh PASS admits motion.lookup", async () => {
    // Given
    const db = openApiDatabase(":memory:");
    const now = Date.parse("2026-08-30T00:00:00Z");

    // When
    const canary = await runMotionToolCanary({
      db,
      ...identity,
      adapter: adapter(validCard),
      now,
      timeoutMs: 100,
    });

    // Then
    expect(canary.status).toBe("PASS");
    expect(canary.toolSchemaDigest).toBe(MOTION_LOOKUP_TOOL_SCHEMA_DIGEST);
    expect(modelMotionTools(canary, identity, now + 599_999, 600_000)).toEqual([
      "motion.lookup",
    ]);
    expect(modelMotionTools(canary, identity, now + 600_000, 600_000)).toEqual(
      [],
    );
    db.close();
  });

  it.each([
    [
      "schema mismatch",
      adapter({ ...validCard, sources_json: "[]" }),
      "SCHEMA_MISMATCH",
    ],
    [
      "provider failure",
      {
        callTool: async () => Promise.reject(new Error("secret raw response")),
      },
      "PROVIDER_FAILURE",
    ],
  ])(
    "Given %s, when the canary runs, then it stores a safe FAIL",
    async (_name, fake, reason) => {
      // Given
      const db = openApiDatabase(":memory:");

      // When
      const canary = await runMotionToolCanary({
        db,
        ...identity,
        adapter: fake,
        now: 0,
        timeoutMs: 100,
      });

      // Then
      expect(canary).toMatchObject({ status: "FAIL", failureReason: reason });
      expect(modelMotionTools(canary, identity, 1, 600_000)).toEqual([]);
      db.close();
    },
  );

  it("Given a provider that never responds, when its deadline elapses, then it stores timeout without raw data", async () => {
    // Given
    const db = openApiDatabase(":memory:");
    const fake: MotionCanaryAdapter = {
      callTool: () => new Promise(() => undefined),
    };

    // When
    const canary = await runMotionToolCanary({
      db,
      ...identity,
      adapter: fake,
      now: 0,
      timeoutMs: 1,
    });
    const stored = db.prepare("SELECT * FROM motion_provider_canaries").get();

    // Then
    expect(canary.failureReason).toBe("PROVIDER_TIMEOUT");
    expect(JSON.stringify(stored)).not.toMatch(
      /api.?key|prompt|raw response|secret/i,
    );
    db.close();
  });

  it("Given tenant-specific rows, when another tenant reads, then replay cannot cross tenant scope", async () => {
    // Given
    const db = openApiDatabase(":memory:");
    await runMotionToolCanary({
      db,
      ...identity,
      adapter: adapter(validCard),
      now: 0,
      timeoutMs: 100,
    });

    // When
    const own = readMotionToolCanary(db, identity);
    const other = readMotionToolCanary(db, {
      ...identity,
      tenantId: "tenant-b",
    });

    // Then
    expect(own?.status).toBe("PASS");
    expect(other).toBeNull();
    db.close();
  });

  it("Given a newer FAIL, when an older or equal PASS is replayed, then terminal failure remains", async () => {
    // Given
    const db = openApiDatabase(":memory:");
    await runMotionToolCanary({
      db,
      ...identity,
      adapter: adapter({}),
      now: 200,
      timeoutMs: 100,
    });

    // When
    await runMotionToolCanary({
      db,
      ...identity,
      adapter: adapter(validCard),
      now: 100,
      timeoutMs: 100,
    });
    await runMotionToolCanary({
      db,
      ...identity,
      adapter: adapter(validCard),
      now: 200,
      timeoutMs: 100,
    });

    // Then
    expect(readMotionToolCanary(db, identity)?.status).toBe("FAIL");
    db.close();
  });

  it("Given an equal-time PASS and FAIL, when failure arrives second, then ambiguity fails closed", async () => {
    // Given
    const db = openApiDatabase(":memory:");
    await runMotionToolCanary({
      db,
      ...identity,
      adapter: adapter(validCard),
      now: 200,
      timeoutMs: 100,
    });

    // When
    await runMotionToolCanary({
      db,
      ...identity,
      adapter: adapter({}),
      now: 200,
      timeoutMs: 100,
    });

    // Then
    expect(readMotionToolCanary(db, identity)?.status).toBe("FAIL");
    db.close();
  });
});

describe("ensureFreshMotionToolCanary", () => {
  it("executes canary when no PASS exists and admits motion.lookup", async () => {
    const { ensureFreshMotionToolCanary } = await import("./motion-canary.js");
    const db = openApiDatabase(":memory:");
    const now = Date.parse("2026-08-30T00:00:00Z");
    const canary = await ensureFreshMotionToolCanary({
      db,
      tenantId: "tenant-a",
      providerKind: "openai",
      model: "gpt-test",
      now,
      ttlMs: 600_000,
      adapter: adapter(validCard),
    });
    expect(canary.status).toBe("PASS");
    expect(modelMotionTools(canary, canary, now + 1, 600_000)).toEqual([
      "motion.lookup",
    ]);
    db.close();
  });

  it("re-runs the provider adapter when a PASS expires", async () => {
    const { ensureFreshMotionToolCanary, providerMotionLookupCanaryAdapter } =
      await import("./motion-canary.js");
    const db = openApiDatabase(":memory:");
    const now = Date.parse("2026-08-30T00:00:00Z");
    let calls = 0;
    const provider = providerMotionLookupCanaryAdapter(async ({ tool }) => {
      calls += 1;
      expect(tool.name).toBe("motion.lookup");
      return validCard;
    });
    await ensureFreshMotionToolCanary({
      db,
      ...identity,
      now,
      ttlMs: 1_000,
      adapter: provider,
    });
    const refreshed = await ensureFreshMotionToolCanary({
      db,
      ...identity,
      now: now + 1_001,
      ttlMs: 1_000,
      adapter: provider,
    });
    expect(calls).toBe(2);
    expect(refreshed.status).toBe("PASS");
    db.close();
  });
});

describe("providerMotionLookupCanaryAdapter", () => {
  it("forwards the schema-shaped motion.lookup call and does not accept a raw SQL row", async () => {
    const { providerMotionLookupCanaryAdapter, runMotionToolCanary } =
      await import("./motion-canary.js");
    const db = openApiDatabase(":memory:");
    let seen: unknown;
    const adapter = providerMotionLookupCanaryAdapter(async (request) => {
      seen = request.tool;
      return validCard;
    });
    const canary = await runMotionToolCanary({
      db,
      ...identity,
      adapter,
      now: 0,
      timeoutMs: 100,
    });
    expect(seen).toEqual({
      name: "motion.lookup",
      input: {
        type: "object",
        properties: { query: { type: "string", minLength: 1 } },
        required: ["query"],
        additionalProperties: false,
      },
    });
    expect(canary.status).toBe("PASS");
    db.close();
  });
});
