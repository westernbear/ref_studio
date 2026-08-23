import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const dashboard = readFileSync(
  resolve(root, "apps/web/src/components/AdminDashboard.tsx"),
  "utf8",
);
const shell = readFileSync(
  resolve(root, "apps/web/src/components/Shells.tsx"),
  "utf8",
);

describe("admin surface contracts", () => {
  it("keeps dashboard operational sections and safe scope language", () => {
    expect(dashboard).toContain("QUEUE HEALTH");
    expect(dashboard).toContain("server-side tenant assignments");
    expect(dashboard).toContain('role="dialog"');
  });
  it("keeps shell destinations bounded and narrow-menu capable", () => {
    expect(shell).toContain('href: "/admin/jobs"');
    expect(shell).toContain('aria-controls="admin-navigation"');
    expect(shell).toContain('href="/projects/new"');
  });
});
