import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  ApiServerConfigError,
  defaultApiDatabasePath,
  loadServerConfig,
} from "./server.js";

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
});
