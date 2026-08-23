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
  it("routes static admin pages to live empty states", () => {
    expect(routes).toContain('"admin/jobs": "Queue & Delivery"');
    expect(routes).toContain('"admin/tenants": "Tenants"');
    expect(routes).toContain("No live records are connected for this page.");
  });
  it("uses semantic disabled behavior and visible focus", () => {
    expect(primitives).toContain("disabled={isDisabled}");
    expect(
      readFileSync(resolve(root, "apps/web/src/styles/primitives.css"), "utf8"),
    ).toContain(":focus-visible");
  });
});
