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
const styles = readFileSync(
  resolve(root, "apps/web/src/styles/primitives.css"),
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
    expect(styles).toContain("button:disabled");
    expect(styles).toContain(":focus-visible");
  });
  it("keeps long detail values inside their responsive grid", () => {
    expect(styles).toContain("repeat(auto-fit, minmax(min(180px, 100%), 1fr))");
    expect(styles).toMatch(
      /\.detail-grid dd \{[^}]*overflow-wrap: anywhere;/su,
    );
  });
  it("keeps data tables readable by scrolling them on narrow screens", () => {
    expect(styles).toMatch(/\.live-table \{[^}]*min-width: 720px;/su);
    expect(styles).not.toMatch(
      /@media \(max-width: 720px\)[\s\S]*\.live-table \{[^}]*table-layout: fixed;/u,
    );
  });
  it("hides only the direct admin navigation aside on narrow screens", () => {
    expect(styles).not.toContain(".shell-admin aside");
    expect(styles).toContain(".shell-admin > aside");
    expect(styles).toContain(".shell-admin > aside.admin-navigation-open");
  });
});
