import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ApiServerConfigError,
  createApiServer,
  defaultApiDatabasePath,
  loadServerConfig,
} from "./server.js";
import { RUNTIME_DIGEST } from "./creator-workflow.js";

describe("api server config", () => {
  it("uses the package data path independent of cwd", () => {
    const originalCwd = process.cwd();
    process.chdir(tmpdir());
    try {
      expect(defaultApiDatabasePath()).toMatch(
        /apps\/api\/data\/app\.sqlite$/u,
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("requires a worker token for the live worker API", () => {
    expect(() => loadServerConfig({})).toThrow(ApiServerConfigError);
  });

  it("registers live upload and creator workflow routes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rvs-api-server-"));
    const app = createApiServer({
      host: "127.0.0.1",
      port: 3_200,
      databasePath: join(directory, "app.sqlite"),
      expectedOrigin: "http://localhost:3100",
      introspectSecret: "secret",
      workerToken: "worker-secret",
    });

    expect(app.hasRoute({ method: "POST", url: "/v1/uploads" })).toBe(true);
    expect(app.hasRoute({ method: "POST", url: "/v1/jobs" })).toBe(true);
    // /v1/reviews was removed with the T1-T6 human-approval gate (replaced
    // by automatic continuation) -- this route must stay gone.
    expect(app.hasRoute({ method: "POST", url: "/v1/reviews" })).toBe(false);
    expect(
      app.hasRoute({ method: "POST", url: "/v1/jobs/:jobId/refine-prompt" }),
    ).toBe(true);
    expect(app.hasRoute({ method: "GET", url: "/admin/tenants" })).toBe(true);
    expect(app.hasRoute({ method: "POST", url: "/admin/audit-exports" })).toBe(
      true,
    );
    await app.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("hydrates server-issued worker sessions after restart", async () => {
    const directory = mkdtempSync(join(tmpdir(), "rvs-api-restart-"));
    const config = {
      host: "127.0.0.1",
      port: 3_200,
      databasePath: join(directory, "app.sqlite"),
      expectedOrigin: "http://localhost:3100",
      introspectSecret: "secret",
      workerToken: "bootstrap-secret",
    };
    const first = createApiServer(config);
    const registered = await first.inject({
      method: "POST",
      url: "/v1/workers/register",
      headers: { authorization: "Bearer bootstrap-secret" },
      payload: {
        workerId: "worker-restart",
        capabilities: ["compiler"],
        preflight: {
          status: "PASS",
          chromiumVersion: "151.0.7922.138",
          renderer: "ANGLE SwiftShader",
          fontReady: true,
          webgl2: true,
          networkPolicy: "external-blocked",
          repeatedFrameByteIdentity: true,
          ffmpeg: true,
          ffprobe: true,
          compilerModels: true,
          runtimeDigest: RUNTIME_DIGEST,
        },
      },
    });
    await first.close();

    const second = createApiServer(config);
    const heartbeat = await second.inject({
      method: "POST",
      url: "/v1/workers/worker-restart/heartbeat",
      headers: {
        authorization: `Bearer ${String(registered.json().sessionToken)}`,
      },
      payload: { capabilities: ["compiler"], leases: [] },
    });

    expect(registered.json().sessionToken).toBeTypeOf("string");
    expect(heartbeat.statusCode).toBe(200);
    await second.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
