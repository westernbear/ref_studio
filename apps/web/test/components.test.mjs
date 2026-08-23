import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const primitives = readFileSync(
  resolve(root, "apps/web/src/components/Primitives.tsx"),
  "utf8",
);
const routes = readFileSync(
  resolve(root, "apps/web/src/app/[...slug]/page.tsx"),
  "utf8",
);
describe("shared control contract projection", () => {
  it("routes admin pages to live API-backed surfaces", () => {
    expect(routes).toContain('"admin/jobs": "Queue & Delivery"');
    expect(routes).toContain('"admin/tenants": "Tenants"');
    expect(routes).toContain('liveApiGet("/admin/tenants")');
    expect(routes).toContain("Admin sign-in required.");
    expect(routes).not.toContain(
      "No live records are connected for this page.",
    );
  });
  it("uses semantic disabled behavior and visible focus", () => {
    expect(primitives).toContain("disabled={isDisabled}");
    expect(
      readFileSync(resolve(root, "apps/web/src/styles/primitives.css"), "utf8"),
    ).toContain(":focus-visible");
  });
});
