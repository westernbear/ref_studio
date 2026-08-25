import { describe, expect, it } from "vitest";
import { buildAuthApp } from "./app.js";
import {
  authenticateBearer,
  authenticateSession,
  authorizeReleaseReview,
  hashBearer,
  hashPassword,
  revokeSession,
  signIn,
  type AuthStore,
} from "./auth.js";

const store = (): AuthStore & {
  readonly events: Array<{
    readonly action: string;
    readonly decision: string;
  }>;
} => {
  const events: Array<{ readonly action: string; readonly decision: string }> =
    [];
  return {
    users: [{ id: "usr_reviewer", email: "reviewer@example.invalid" }],
    credentials: [
      {
        userId: "usr_reviewer",
        kind: "PASSWORD",
        secretHash: hashPassword("correct", "fixed-salt"),
        revokedAt: null,
      },
    ],
    memberships: [
      {
        userId: "usr_reviewer",
        tenantId: "ten_demo",
        role: "DESIGNATED_REVIEWER",
      },
    ],
    assignments: [
      {
        reviewerId: "usr_reviewer",
        tenantId: null,
        gate: "T6",
        scope: "RELEASE",
      },
    ],
    sessions: [],
    apiTokens: [
      {
        id: "tok_1",
        userId: "usr_reviewer",
        tenantId: "ten_demo",
        tokenHash: hashBearer("bearer-secret"),
        expiresAt: 2_000,
        revokedAt: null,
      },
    ],
    events,
    audit: (event) => {
      events.push({ action: event.action, decision: event.decision });
    },
  };
};

describe("auth flows", () => {
  it("serves creator and admin sign-in with secure idle cookies", async () => {
    const fixture = store();
    const app = buildAuthApp({
      store: fixture,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "service-secret",
      now: () => 1_000,
    });
    const creator = await app.inject({
      method: "POST",
      url: "/sign-in",
      headers: { origin: "https://studio.invalid" },
      payload: { email: "reviewer@example.invalid", password: "correct" },
    });
    const admin = await app.inject({
      method: "POST",
      url: "/admin/sign-in",
      headers: { origin: "https://studio.invalid" },
      payload: { email: "reviewer@example.invalid", password: "wrong" },
    });
    expect(creator.statusCode).toBe(200);
    expect(creator.headers["set-cookie"]).toContain("HttpOnly");
    expect(creator.headers["set-cookie"]).toContain("Secure");
    expect(creator.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(creator.headers["set-cookie"]).toContain("Max-Age=1800");
    expect(admin.statusCode).toBe(401);
    expect(admin.json().error.code).toBe("AUTHENTICATION_REQUIRED");
    await app.close();
  });
  it("enforces browser BFF CSRF and logout revocation", async () => {
    const fixture = store();
    const app = buildAuthApp({
      store: fixture,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "service-secret",
      now: () => 1_000,
    });
    const login = await app.inject({
      method: "POST",
      url: "/sign-in",
      headers: { origin: "https://studio.invalid" },
      payload: { email: "reviewer@example.invalid", password: "correct" },
    });
    const sessionCookie = login.headers["set-cookie"];
    const denied = await app.inject({
      method: "GET",
      url: "/bff/session-introspect",
      headers: {
        cookie: sessionCookie,
        "x-session-introspect-secret": "service-secret",
        origin: "https://studio.invalid",
      },
    });
    const introspected = await app.inject({
      method: "GET",
      url: "/bff/session-introspect",
      headers: {
        cookie: sessionCookie,
        "x-session-introspect-secret": "service-secret",
        origin: "https://studio.invalid",
        "x-csrf-token": "csrf",
      },
    });
    const logout = await app.inject({
      method: "POST",
      url: "/logout",
      headers: { cookie: sessionCookie },
    });
    expect(denied.json().error.code).toBe("CSRF_REQUIRED");
    expect(introspected.statusCode).toBe(200);
    expect(introspected.json()).not.toHaveProperty("principal");
    expect(introspected.json()).not.toHaveProperty("roles");
    expect(introspected.json()).not.toHaveProperty("capabilities");
    expect(logout.headers["set-cookie"]).toContain("Max-Age=0");
    const reused = await app.inject({
      method: "GET",
      url: "/bff/session-introspect",
      headers: {
        cookie: sessionCookie,
        "x-session-introspect-secret": "service-secret",
        origin: "https://studio.invalid",
        "x-csrf-token": "csrf",
      },
    });
    expect(reused.json().error.code).toBe("AUTHENTICATION_REQUIRED");
    await app.close();
  });
  it("rejects forged origins and rotates tenant sessions", async () => {
    const fixture = store();
    const app = buildAuthApp({
      store: fixture,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "service-secret",
      now: () => 1_000,
    });
    const login = await app.inject({
      method: "POST",
      url: "/sign-in",
      headers: { origin: "https://studio.invalid" },
      payload: { email: "reviewer@example.invalid", password: "correct" },
    });
    const oldCookie = login.headers["set-cookie"];
    const originDenied = await app.inject({
      method: "GET",
      url: "/bff/session-introspect",
      headers: {
        cookie: oldCookie,
        "x-session-introspect-secret": "service-secret",
        origin: "https://evil.invalid",
        "x-csrf-token": "csrf",
      },
    });
    const rotated = await app.inject({
      method: "POST",
      url: "/session/tenant",
      headers: {
        cookie: oldCookie,
        origin: "https://studio.invalid",
        "x-csrf-token": "csrf",
      },
      payload: { tenantId: "ten_demo" },
    });
    const oldUse = await app.inject({
      method: "GET",
      url: "/bff/session-introspect",
      headers: {
        cookie: oldCookie,
        "x-session-introspect-secret": "service-secret",
        origin: "https://studio.invalid",
        "x-csrf-token": "csrf",
      },
    });
    const newUse = await app.inject({
      method: "GET",
      url: "/bff/session-introspect",
      headers: {
        cookie: rotated.headers["set-cookie"],
        "x-session-introspect-secret": "service-secret",
        origin: "https://studio.invalid",
        "x-csrf-token": "csrf",
      },
    });
    expect(originDenied.json().error.code).toBe("CSRF_ORIGIN_INVALID");
    expect(rotated.headers["set-cookie"]).toContain("HttpOnly");
    expect(rotated.headers["set-cookie"]).toContain("Secure");
    expect(rotated.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(rotated.headers["set-cookie"]).toContain("Max-Age=1800");
    expect(oldUse.json().error.code).toBe("AUTHENTICATION_REQUIRED");
    expect(newUse.statusCode).toBe(200);
    await app.close();
  });
  it("rejects missing and foreign sign-in origins", async () => {
    const fixture = store();
    const app = buildAuthApp({
      store: fixture,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "service-secret",
      now: () => 1_000,
    });
    for (const url of ["/sign-in", "/admin/sign-in"]) {
      const missing = await app.inject({
        method: "POST",
        url,
        payload: { email: "reviewer@example.invalid", password: "correct" },
      });
      const foreign = await app.inject({
        method: "POST",
        url,
        headers: { origin: "https://evil.invalid" },
        payload: { email: "reviewer@example.invalid", password: "correct" },
      });
      expect(missing.statusCode).toBe(403);
      expect(missing.json().error.code).toBe("CSRF_ORIGIN_INVALID");
      expect(foreign.statusCode).toBe(403);
      expect(foreign.json().error.code).toBe("CSRF_ORIGIN_INVALID");
    }
    expect(fixture.sessions).toHaveLength(0);
    await app.close();
  });
  it("protects direct identity routes from tenant header forgery", async () => {
    const fixture = store();
    const app = buildAuthApp({
      store: fixture,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "service-secret",
      now: () => 1_000,
    });
    const identity = await app.inject({
      method: "GET",
      url: "/v1/identity",
      headers: {
        authorization: "Bearer bearer-secret",
        "x-tenant-id": "ten_demo",
      },
    });
    const forged = await app.inject({
      method: "GET",
      url: "/v1/identity",
      headers: {
        authorization: "Bearer bearer-secret",
        "x-tenant-id": "ten_other",
      },
    });
    expect(identity.statusCode).toBe(200);
    expect(forged.json().error.code).toBe("TENANT_BOUNDARY_BYPASS");
    expect(fixture.events).toEqual(
      expect.arrayContaining([
        { action: "AUTH_TENANT_DENIED", decision: "DENIED" },
      ]),
    );
    await app.close();
  });
  it("signs in with a safe error for a wrong secret", () => {
    const result = signIn(store(), "reviewer@example.invalid", "wrong", 1_000);
    expect(result.error).toBe("AUTHENTICATION_REQUIRED");
  });
  it("derives browser principal and expires idle session", () => {
    const fixture = store();
    const login = signIn(fixture, "reviewer@example.invalid", "correct", 1_000);
    const session = login.session;
    expect(session).not.toBeNull();
    if (!session) return;
    expect(
      authenticateSession(
        fixture,
        session.id,
        "csrf",
        "https://studio.invalid",
        "https://studio.invalid",
        1_001,
      ),
    ).toMatchObject({ userId: "usr_reviewer", tenantId: "ten_demo" });
    expect(
      authenticateSession(
        fixture,
        session.id,
        undefined,
        "https://studio.invalid",
        "https://studio.invalid",
        1_001,
      ),
    ).toEqual({ code: "CSRF_REQUIRED" });
    expect(
      authenticateSession(
        fixture,
        session.id,
        "csrf",
        "https://studio.invalid",
        "https://studio.invalid",
        1_802_000,
      ),
    ).toEqual({ code: "AUTHENTICATION_REQUIRED" });
  });
  it("intersects bearer tenant and supports revocation", () => {
    const fixture = store();
    expect(
      authenticateBearer(fixture, "bearer-secret", "ten_other", 1_000),
    ).toEqual({ code: "TENANT_BOUNDARY_BYPASS" });
    expect(
      authenticateBearer(fixture, "bearer-secret", "ten_demo", 1_000),
    ).toMatchObject({ userId: "usr_reviewer" });
    const token = fixture.apiTokens[0];
    if (token) token.revokedAt = 1_001;
    expect(
      authenticateBearer(fixture, "bearer-secret", "ten_demo", 1_002),
    ).toEqual({ code: "AUTHENTICATION_REQUIRED" });
  });
  it("allows release-scope T6 only without a tenant header", () => {
    const fixture = store();
    const principal = authenticateBearer(
      fixture,
      "bearer-secret",
      "ten_demo",
      1_000,
    );
    if ("code" in principal) return;
    expect(authorizeReleaseReview(fixture, principal, undefined)).toBeNull();
    expect(authorizeReleaseReview(fixture, principal, "ten_demo")).toEqual({
      code: "TENANT_HEADER_FORBIDDEN",
    });
    const login = signIn(fixture, "reviewer@example.invalid", "correct", 1_000);
    if (login.session) revokeSession(fixture, login.session.id, 1_001);
  });
  it("honors a configured admin session timeout instead of the 30-minute default", async () => {
    const fixture = store();
    const app = buildAuthApp({
      store: fixture,
      expectedOrigin: "https://studio.invalid",
      introspectSecret: "service-secret",
      now: () => 1_000,
      adminSessionTimeoutMs: 5 * 60 * 1000,
    });
    const login = await app.inject({
      method: "POST",
      url: "/sign-in",
      headers: { origin: "https://studio.invalid" },
      payload: { email: "reviewer@example.invalid", password: "correct" },
    });
    expect(login.headers["set-cookie"]).toContain("Max-Age=300");
    await app.close();
  });
});
