import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { buildAuthApp } from "./app.js";
import type { AuthStore } from "./auth.js";
import { createCreatorWorkflowStore } from "./creator-workflow.js";
import { createReviewStore } from "./reviews.js";
import type { UploadStore } from "./uploads.js";
import { createWorkerStore, hashWorkerToken } from "./workers.js";

const APP_PATH_MARKER = `${path.sep}apps${path.sep}api${path.sep}`;
const ServerEnv = z.object({
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3_200),
  DATABASE_PATH: z.string().min(1).optional(),
  RVS_EXPECTED_ORIGIN: z.string().url().default("http://localhost:3100"),
  RVS_SESSION_INTROSPECT_SECRET: z
    .string()
    .min(1)
    .default("dev-introspect-secret"),
  RVS_WORKER_TOKEN: z.string().min(1),
});
const UserRows = z.array(z.object({ id: z.string(), email: z.string() }));
const CredentialRows = z.array(
  z.object({
    user_id: z.string(),
    secret_hash: z.string(),
    kind: z.literal("PASSWORD").or(z.literal("SERVICE")),
    revoked_at: z.string().nullable(),
  }),
);
const MembershipRows = z.array(
  z.object({ user_id: z.string(), tenant_id: z.string(), role: z.string() }),
);
const AssignmentRows = z.array(
  z.object({
    reviewer_id: z.string(),
    tenant_id: z.string().nullable(),
    gate: z.string(),
    scope: z.literal("TENANT").or(z.literal("RELEASE")),
  }),
);
const ApiTokenRows = z.array(
  z.object({
    id: z.string(),
    user_id: z.string(),
    tenant_id: z.string(),
    token_hash: z.string(),
    expires_at: z.string(),
    revoked_at: z.string().nullable(),
  }),
);

export type ApiServerConfig = Readonly<{
  host: string;
  port: number;
  databasePath: string;
  expectedOrigin: string;
  introspectSecret: string;
  workerToken: string;
}>;

export class ApiServerConfigError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`API_SERVER_CONFIG_INVALID: ${issues.join(", ")}`);
    this.name = "ApiServerConfigError";
    this.issues = issues;
  }
}

export const defaultApiDatabasePath = (): string => {
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const markerIndex = directory.indexOf(APP_PATH_MARKER);
  return markerIndex === -1
    ? path.resolve("apps/api/data/app.sqlite")
    : path.join(
        directory.slice(0, markerIndex + APP_PATH_MARKER.length),
        "data/app.sqlite",
      );
};

export function loadServerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiServerConfig {
  const parsed = ServerEnv.safeParse(env);
  if (!parsed.success)
    throw new ApiServerConfigError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    );
  return {
    host: parsed.data.HOST,
    port: parsed.data.PORT,
    databasePath: parsed.data.DATABASE_PATH ?? defaultApiDatabasePath(),
    expectedOrigin: parsed.data.RVS_EXPECTED_ORIGIN,
    introspectSecret: parsed.data.RVS_SESSION_INTROSPECT_SECRET,
    workerToken: parsed.data.RVS_WORKER_TOKEN,
  };
}

const timestamp = (value: string | null): number | null =>
  value === null ? null : Date.parse(value);

export function loadAuthStore(
  databasePath: string = defaultApiDatabasePath(),
): AuthStore {
  const db = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });
  try {
    return {
      users: UserRows.parse(db.prepare("SELECT id, email FROM users").all()),
      credentials: CredentialRows.parse(
        db
          .prepare(
            "SELECT user_id, secret_hash, kind, revoked_at FROM credentials",
          )
          .all(),
      ).map((row) => ({
        userId: row.user_id,
        secretHash: row.secret_hash,
        kind: row.kind,
        revokedAt: row.revoked_at,
      })),
      memberships: MembershipRows.parse(
        db
          .prepare("SELECT user_id, tenant_id, role FROM tenant_memberships")
          .all(),
      ).map((row) => ({
        userId: row.user_id,
        tenantId: row.tenant_id,
        role: row.role,
      })),
      assignments: AssignmentRows.parse(
        db
          .prepare(
            "SELECT reviewer_id, tenant_id, gate, scope FROM reviewer_assignments",
          )
          .all(),
      ).map((row) => ({
        reviewerId: row.reviewer_id,
        tenantId: row.tenant_id,
        gate: row.gate,
        scope: row.scope,
      })),
      sessions: [],
      apiTokens: ApiTokenRows.parse(
        db
          .prepare(
            "SELECT id, user_id, tenant_id, token_hash, expires_at, revoked_at FROM api_tokens",
          )
          .all(),
      ).map((row) => ({
        id: row.id,
        userId: row.user_id,
        tenantId: row.tenant_id,
        tokenHash: row.token_hash,
        expiresAt: Date.parse(row.expires_at),
        revokedAt: timestamp(row.revoked_at),
      })),
      audit: () => undefined,
    };
  } finally {
    db.close();
  }
}

export function createApiServer(config: ApiServerConfig) {
  const uploads: UploadStore = {
    uploads: new Map(),
    cas: new Map(),
    casByTenantDigest: new Map(),
    now: Date.now,
  };
  const app = buildAuthApp({
    store: loadAuthStore(config.databasePath),
    expectedOrigin: config.expectedOrigin,
    introspectSecret: config.introspectSecret,
    uploads,
    creatorWorkflow: createCreatorWorkflowStore(),
    reviews: createReviewStore(),
    workers: createWorkerStore(hashWorkerToken(config.workerToken)),
  });
  app.get("/health", async () => ({ ok: true }));
  return app;
}

export async function startApiServer(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const config = loadServerConfig(env);
  const app = createApiServer(config);
  await app.listen({ host: config.host, port: config.port });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await startApiServer();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "api server failed");
    process.exitCode = 1;
  }
}
