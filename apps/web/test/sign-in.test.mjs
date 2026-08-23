import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  forwardedSetCookie,
  internalApiUrl,
  signInProxyUrl,
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

    expect(signInProxyUrl("/admin/sign-in")).toBe(
      "http://api:3200/admin/sign-in",
    );
    expect(signInProxyUrl("/sign-in")).toBe("http://api:3200/sign-in");

    process.env.RVS_INTERNAL_API_URL = "";
    process.env.NEXT_PUBLIC_API_URL = "";
    expect(signInProxyUrl("/sign-in")).toBe("http://127.0.0.1:3200/sign-in");
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
});
