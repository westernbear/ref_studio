import type Database from "better-sqlite3";
import { tool, type LanguageModel, type ToolSet } from "ai";
import { z } from "zod";
import {
  MOTION_LOOKUP_TOOL_SCHEMA,
  MOTION_LOOKUP_TOOL_SCHEMA_DIGEST,
  MotionKnowledgeCardSchema,
  lookupMotionKnowledge,
  modelMotionTools,
  motionKnowledgeCardToCanaryRow,
  ProviderToolCanaryV1Schema,
  type ProviderToolCanaryV1,
} from "./motion-knowledge.js";

const CanaryIdentitySchema = z
  .object({
    tenantId: z.string().min(1).max(200),
    providerKind: z.string().min(1).max(100),
    model: z.string().min(1).max(200),
  })
  .strict();

export type MotionCanaryAdapter = {
  readonly callTool: (request: {
    readonly tool: typeof MOTION_LOOKUP_TOOL_SCHEMA;
    readonly input: { readonly query: "opacity" };
    readonly signal: AbortSignal;
  }) => Promise<unknown>;
};

export type MotionCanaryPublic = ProviderToolCanaryV1;

type CanaryRow = {
  tenant_id: string;
  provider_kind: string;
  model: string;
  status: "PASS" | "FAIL";
  checked_at: string;
  tool_schema_digest: string;
  failure_reason: string | null;
};

const toPublic = (row: CanaryRow): MotionCanaryPublic =>
  ProviderToolCanaryV1Schema.parse({
    tenantId: row.tenant_id,
    providerKind: row.provider_kind,
    model: row.model,
    toolName: "motion.lookup",
    status: row.status,
    checkedAt: row.checked_at,
    toolSchemaDigest: row.tool_schema_digest,
    failureReason: row.failure_reason,
  });

export function readMotionToolCanary(
  db: Database.Database,
  identity: z.input<typeof CanaryIdentitySchema>,
): MotionCanaryPublic | null {
  const key = CanaryIdentitySchema.parse({
    tenantId: identity.tenantId,
    providerKind: identity.providerKind,
    model: identity.model,
  });
  const row = db
    .prepare(
      `SELECT tenant_id, provider_kind, model, status, checked_at,
              tool_schema_digest, failure_reason
         FROM motion_provider_canaries
        WHERE tenant_id = ? AND provider_kind = ? AND model = ?`,
    )
    .get(key.tenantId, key.providerKind, key.model) as CanaryRow | undefined;
  return row ? toPublic(row) : null;
}

const store = (
  db: Database.Database,
  canary: MotionCanaryPublic,
): MotionCanaryPublic => {
  db.prepare(
    `INSERT INTO motion_provider_canaries
       (tenant_id, provider_kind, model, status, checked_at, tool_schema_digest, failure_reason)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(tenant_id, provider_kind, model) DO UPDATE SET
       status = excluded.status,
       checked_at = excluded.checked_at,
       tool_schema_digest = excluded.tool_schema_digest,
       failure_reason = excluded.failure_reason
     WHERE excluded.checked_at > motion_provider_canaries.checked_at
        OR (excluded.checked_at = motion_provider_canaries.checked_at
            AND motion_provider_canaries.status = 'PASS'
            AND excluded.status = 'FAIL')`,
  ).run(
    canary.tenantId,
    canary.providerKind,
    canary.model,
    canary.status,
    canary.checkedAt,
    canary.toolSchemaDigest,
    canary.failureReason ?? null,
  );
  const stored = readMotionToolCanary(db, canary);
  if (!stored) throw new Error("MOTION_CANARY_WRITE_FAILED");
  return stored;
};

export function listMotionToolCanaries(
  db: Database.Database,
): readonly MotionCanaryPublic[] {
  return (
    db
      .prepare(
        `SELECT tenant_id, provider_kind, model, status, checked_at,
              tool_schema_digest, failure_reason
         FROM motion_provider_canaries
        ORDER BY tenant_id, provider_kind, model`,
      )
      .all() as CanaryRow[]
  ).map(toPublic);
}

export type ProviderMotionLookupInvoker = (request: {
  readonly tool: typeof MOTION_LOOKUP_TOOL_SCHEMA;
  readonly input: { readonly query: "opacity" };
  readonly signal: AbortSignal;
}) => Promise<unknown>;

/**
 * Provider adapter seam: the canary sends a `motion.lookup` schema call
 * through the invoker. It does not query the host card table itself.
 */
export function providerMotionLookupCanaryAdapter(
  invokeProvider: ProviderMotionLookupInvoker,
): MotionCanaryAdapter {
  return {
    callTool: async ({ tool, input, signal }) => {
      if (tool.name !== "motion.lookup") throw new Error("UNKNOWN_TOOL");
      z.object({ query: z.string().min(1) })
        .strict()
        .parse(input);
      return invokeProvider({
        tool: MOTION_LOOKUP_TOOL_SCHEMA,
        input: { query: "opacity" },
        signal,
      });
    },
  };
}

/** Same execute path the production model tool uses after the provider calls it. */
export function executeMotionLookupTool(
  db: Database.Database,
  query: string,
): Record<string, unknown> {
  const cards = lookupMotionKnowledge(db, query);
  const card = cards[0];
  if (!card) throw new Error("MOTION_KNOWLEDGE_NOT_FOUND");
  return motionKnowledgeCardToCanaryRow(card);
}

/** Host-side adapter kept for fixtures that intentionally skip the provider seam. */
export function hostMotionLookupCanaryAdapter(
  db: Database.Database,
): MotionCanaryAdapter {
  return providerMotionLookupCanaryAdapter(async ({ input }) =>
    executeMotionLookupTool(db, input.query),
  );
}

export type GenerateLiveCanary = (options: {
  readonly model: LanguageModel;
  readonly schema: z.ZodTypeAny;
  readonly system: string;
  readonly prompt: string;
  readonly tools: ToolSet;
  readonly toolChoice: {
    readonly type: "tool";
    readonly toolName: "motion.lookup";
  };
  readonly abortSignal?: AbortSignal;
}) => Promise<{ readonly object: unknown }>;

/**
 * Production canary invoker: the provider must call `motion.lookup` through
 * its tool channel (`toolChoice`). Host SQL runs only inside that tool.
 */
export function liveProviderMotionLookupCanaryAdapter(params: {
  readonly db: Database.Database;
  readonly model: LanguageModel;
  readonly generate: GenerateLiveCanary;
}): MotionCanaryAdapter {
  return providerMotionLookupCanaryAdapter(async ({ signal }) => {
    let toolResult: unknown;
    const generated = await params.generate({
      model: params.model,
      schema: z
        .object({
          id: z.string().min(1),
          domain: z.string().min(1),
          title_en: z.string().min(1),
          title_ko: z.string().min(1),
          definition_en: z.string().min(1),
          definition_ko: z.string().min(1),
          distinctions_json: z.string().min(1),
          parameters_json: z.string().min(1),
          capabilities_json: z.string().min(1),
          operation_refs_json: z.string().min(1),
          verifier_refs_json: z.string().min(1),
          sources_json: z.string().min(1),
        })
        .strict(),
      system:
        "Call the motion.lookup tool with query opacity and return that card.",
      prompt: "opacity",
      tools: {
        "motion.lookup": tool({
          description: "Look up canonical motion knowledge.",
          inputSchema: z.object({ query: z.string().min(1) }).strict(),
          execute: async ({ query }) => {
            toolResult = executeMotionLookupTool(params.db, query);
            return toolResult;
          },
        }),
      },
      toolChoice: { type: "tool", toolName: "motion.lookup" },
      abortSignal: signal,
    });
    if (toolResult === undefined && generated.object === undefined)
      throw new Error("PROVIDER_DID_NOT_CALL_TOOL");
    return toolResult ?? generated.object;
  });
}

/**
 * Production admission helper: reuse a fresh PASS, otherwise execute the canary
 * via the provided adapter. Callers must supply a provider adapter.
 */
export async function ensureFreshMotionToolCanary(params: {
  readonly db: Database.Database;
  readonly tenantId: string;
  readonly providerKind: string;
  readonly model: string;
  readonly now: number;
  readonly ttlMs: number;
  readonly timeoutMs?: number;
  readonly adapter: MotionCanaryAdapter;
}): Promise<MotionCanaryPublic> {
  const identity = {
    tenantId: params.tenantId,
    providerKind: params.providerKind,
    model: params.model,
  };
  const existing = readMotionToolCanary(params.db, identity);
  if (
    existing &&
    modelMotionTools(existing, identity, params.now, params.ttlMs).length > 0
  )
    return existing;
  return runMotionToolCanary({
    db: params.db,
    ...identity,
    adapter: params.adapter,
    now: params.now,
    timeoutMs: params.timeoutMs ?? 5_000,
  });
}

export async function runMotionToolCanary(params: {
  readonly db: Database.Database;
  readonly tenantId: string;
  readonly providerKind: string;
  readonly model: string;
  readonly adapter: MotionCanaryAdapter;
  readonly now: number;
  readonly timeoutMs: number;
}): Promise<MotionCanaryPublic> {
  const identity = CanaryIdentitySchema.parse({
    tenantId: params.tenantId,
    providerKind: params.providerKind,
    model: params.model,
  });
  const checkedAt = new Date(params.now).toISOString();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      params.adapter.callTool({
        tool: MOTION_LOOKUP_TOOL_SCHEMA,
        input: { query: "opacity" },
        signal: controller.signal,
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new MotionCanaryTimeoutError());
        }, params.timeoutMs);
      }),
    ]);
    MotionKnowledgeCardSchema.parse(result);
    return store(params.db, {
      ...identity,
      toolName: "motion.lookup",
      status: "PASS",
      checkedAt,
      toolSchemaDigest: MOTION_LOOKUP_TOOL_SCHEMA_DIGEST,
      failureReason: null,
    });
  } catch (error) {
    const failureReason =
      error instanceof MotionCanaryTimeoutError
        ? "PROVIDER_TIMEOUT"
        : error instanceof z.ZodError
          ? "SCHEMA_MISMATCH"
          : "PROVIDER_FAILURE";
    return store(params.db, {
      ...identity,
      toolName: "motion.lookup",
      status: "FAIL",
      checkedAt,
      toolSchemaDigest: MOTION_LOOKUP_TOOL_SCHEMA_DIGEST,
      failureReason,
    });
  } finally {
    if (timer) clearTimeout(timer);
  }
}

class MotionCanaryTimeoutError extends Error {
  constructor() {
    super("motion provider canary timed out");
    this.name = "MotionCanaryTimeoutError";
  }
}
