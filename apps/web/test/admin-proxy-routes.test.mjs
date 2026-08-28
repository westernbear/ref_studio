import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ADMIN_MUTATION_ROUTES } from "../src/app/api/auth-proxy.ts";

// An admin mutation the API serves but the browser proxy does not name is
// unreachable from the console, and the console reports it as
// RESOURCE_NOT_FOUND -- a 404 that reads as "this endpoint does not exist"
// when it does, one hop away. That is how the material-generator settings
// page shipped: the API route, the form and the messages were all there,
// and saving 404'd because of one missing line in an allowlist.
//
// This reads the API's own registrations out of the source rather than
// importing them, because apps/web cannot import from apps/api -- they are
// separate deployables. Brittle to a formatting change in that one
// expression, and that is the trade: a test that breaks loudly when the
// two lists drift beats a console button that silently does nothing.
const API_SOURCE = "../../api/src/admin-mutation.ts";

const apiRoutes = () => {
  const source = readFileSync(new URL(API_SOURCE, import.meta.url), "utf8");
  return [...source.matchAll(/app\.(post|patch)\("\/admin\/([^"]+)"/gu)].map(
    ([, method, path]) => [
      method.toUpperCase(),
      // :tenantId and friends are ids the proxy patterns write as "*".
      path
        .split("/")
        .map((segment) => (segment.startsWith(":") ? "*" : segment)),
    ],
  );
};

const key = ([method, segments]) => `${method} /${segments.join("/")}`;

describe("the admin proxy allowlist", () => {
  it("finds the API's admin mutation routes at all", () => {
    // Guards the regex above: a formatting change that made it match
    // nothing would otherwise make this whole file pass vacuously.
    expect(apiRoutes().length).toBeGreaterThan(10);
  });

  it("names every admin mutation the API serves", () => {
    const allowed = new Set(ADMIN_MUTATION_ROUTES.map(key));
    // Deliberately not proxied: draining and resuming the queue are
    // operator actions with no console control, and exposing them to the
    // browser would be a new surface, not a fix.
    const unproxied = new Set(["POST /queue/drain", "POST /queue/resume"]);
    const missing = apiRoutes()
      .map(key)
      .filter((route) => !allowed.has(route) && !unproxied.has(route));
    expect(
      missing,
      `not reachable from the console: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("does not allow a route the API does not serve", () => {
    const served = new Set(apiRoutes().map(key));
    const extra = ADMIN_MUTATION_ROUTES.map(key).filter(
      (route) => !served.has(route),
    );
    expect(extra, `proxied but not served: ${extra.join(", ")}`).toEqual([]);
  });
});
