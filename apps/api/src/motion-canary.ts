import type Database from "better-sqlite3";
import { z } from "zod";
import {
  MOTION_LOOKUP_TOOL_SCHEMA,
  MOTION_LOOKUP_TOOL_SCHEMA_DIGEST,
  MotionKnowledgeCardSchema,
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
  const key = CanaryIdentitySchema.parse(identity);
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
       failure_reason = excluded.failure_reason`,
  ).run(
    canary.tenantId,
    canary.providerKind,
    canary.model,
    canary.status,
    canary.checkedAt,
    canary.toolSchemaDigest,
    canary.failureReason ?? null,
  );
  return canary;
};

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
