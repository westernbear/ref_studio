import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forwardedSetCookie,
  internalApiUrl,
  proxyAdmin,
  proxyLogout,
  proxySignIn,
  proxyV1,
} from "../src/app/api/auth-proxy";

const root = resolve(import.meta.dirname, "../../..");
const source = readFileSync(
  resolve(root, "apps/web/src/components/SignInForm.tsx"),
  "utf8",
);
const originalEnv = { ...process.env };
const resetEnv = (name) => {
  const value = originalEnv[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
};

describe("shared sign-in contract", () => {
  afterEach(() => {
    resetEnv("NEXT_PUBLIC_API_URL");
    resetEnv("RVS_INTERNAL_API_URL");
    resetEnv("RVS_INSECURE_COOKIES");
    resetEnv("RVS_EXPECTED_ORIGIN");
    vi.unstubAllGlobals();
  });

  it("uses safe API destinations and rejects external return paths", () => {
    expect(source).toContain("isSafeReturnUrl");
    expect(source).toContain('!value.startsWith("//")');
    expect(source).toContain(
      'const API_PREFIX = process.env.NEXT_PUBLIC_API_URL || "/api";',
    );
    expect(source).toContain("window.location.assign(destination)");
  });

  it("preserves only the identifier and clears the secret after failures", () => {
    expect(source).toContain("value={identifier}");
    expect(source).toContain('setSecret("")');
    expect(source).toContain("secretRef.current?.focus()");
  });

  it("keeps accessible form and duplicate-submit behavior", () => {
    expect(source).toContain("onSubmit={submit}");
    expect(source).toContain('type="submit"');
    expect(source).toContain("if (busy) return");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('type="button"');
  });

  it("proxies docker sign-in requests to the internal API", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.RVS_INTERNAL_API_URL = "http://api:3200";

    expect(internalApiUrl("/admin/sign-in")).toBe(
      "http://api:3200/admin/sign-in",
    );
    expect(internalApiUrl("/sign-in")).toBe("http://api:3200/sign-in");

    process.env.RVS_INTERNAL_API_URL = "";
    process.env.NEXT_PUBLIC_API_URL = "";
    expect(internalApiUrl("/sign-in")).toBe("http://127.0.0.1:3200/sign-in");
    expect(internalApiUrl("/v1/uploads", "?limit=1")).toBe(
      "http://127.0.0.1:3200/v1/uploads?limit=1",
    );
  });

  it("can forward session cookies over local HTTP when explicitly enabled", () => {
    process.env.RVS_INSECURE_COOKIES = "true";

    expect(
      forwardedSetCookie(
        "rvs_session=fixture; Path=/; HttpOnly; Secure; SameSite=Lax",
      ),
    ).toBe("rvs_session=fixture; Path=/; HttpOnly; SameSite=Lax");
  });

  it("requires the configured browser origin before proxying sign-in", async () => {
    process.env.RVS_EXPECTED_ORIGIN = "https://studio.invalid";
    const fetchMock = vi.fn(async (_url, init) => {
      expect(init.headers.origin).toBe("https://studio.invalid");
      return Response.json(
        { ok: true },
        { headers: { "set-cookie": "rvs_session=fixture; Secure" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const missing = await proxySignIn(
      new Request("https://studio.invalid/api/sign-in", {
        method: "POST",
        body: JSON.stringify({
          email: "user@example.test",
          password: "secret",
        }),
      }),
      "/sign-in",
    );
    const foreign = await proxySignIn(
      new Request("https://studio.invalid/api/admin/sign-in", {
        method: "POST",
        headers: { origin: "https://evil.invalid" },
        body: JSON.stringify({
          email: "user@example.test",
          password: "secret",
        }),
      }),
      "/admin/sign-in",
    );
    const allowed = await proxySignIn(
      new Request("https://studio.invalid/api/sign-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://studio.invalid",
        },
        body: JSON.stringify({
          email: "user@example.test",
          password: "secret",
        }),
      }),
      "/sign-in",
    );

    expect(missing.status).toBe(403);
    expect(foreign.status).toBe(403);
    expect(allowed.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts browser same-origin sign-in when the backend origin default differs", async () => {
    delete process.env.RVS_EXPECTED_ORIGIN;
    const fetchMock = vi.fn(async (_url, init) => {
      expect(init.headers.origin).toBe("http://localhost:3100");
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxySignIn(
      new Request("http://localhost:3101/api/admin/sign-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          host: "127.0.0.1:3101",
          origin: "http://127.0.0.1:3101",
        },
        body: JSON.stringify({
          email: "admin@example.test",
          password: "secret",
        }),
      }),
      "/admin/sign-in",
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forwards 204 responses without constructing a forbidden body", async () => {
    process.env.RVS_EXPECTED_ORIGIN = "http://localhost:3100";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 204,
            headers: { "x-received-bytes": "12" },
          }),
      ),
    );
    const response = await proxyV1(
      new Request("http://localhost/api/v1/uploads/upl_a/chunks/0", {
        method: "PUT",
        headers: { origin: "http://localhost:3100" },
        body: Uint8Array.from([1]),
      }),
      ["uploads", "upl_a", "chunks", "0"],
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("x-received-bytes")).toBe("12");
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it("rejects foreign mutation origins before any proxy request", async () => {
    process.env.RVS_EXPECTED_ORIGIN = "https://studio.invalid";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const request = (path) =>
      new Request(`https://studio.invalid${path}`, {
        method: "POST",
        headers: { origin: "https://foreign.invalid" },
        body: "{}",
      });

    const responses = await Promise.all([
      proxyLogout(request("/api/logout")),
      proxyV1(request("/api/v1/reviews"), ["reviews"]),
      proxyAdmin(request("/api/admin/audit-exports"), ["audit-exports"]),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403,
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proxies allowlisted admin exports with session and request fencing", async () => {
    process.env.RVS_EXPECTED_ORIGIN = "https://studio.invalid";
    process.env.RVS_INTERNAL_API_URL = "";
    const fetchMock = vi.fn(async (url, init) => {
      expect(url).toBe("http://127.0.0.1:3200/admin/audit-exports");
      expect(init.headers.get("cookie")).toBe("rvs_session=fixture");
      expect(init.headers.get("origin")).toBe("https://studio.invalid");
      expect(init.headers.get("x-csrf-token")).toBe("web-proxy");
      return Response.json(
        { exportId: "exp_a", state: "PENDING" },
        { status: 202 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await proxyAdmin(
      new Request("https://studio.invalid/api/admin/audit-exports", {
        method: "POST",
        headers: {
          cookie: "rvs_session=fixture",
          "content-type": "application/json",
          "idempotency-key": "export-a",
          origin: "https://studio.invalid",
        },
        body: JSON.stringify({ format: "jsonl", reason: "test" }),
      }),
      ["audit-exports"],
    );

    expect(response.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
