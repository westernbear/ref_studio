import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const shell = readFileSync(
  resolve(root, "apps/web/src/components/Shells.tsx"),
  "utf8",
);
const routes = readFileSync(
  resolve(root, "apps/web/src/app/[...slug]/page.tsx"),
  "utf8",
);

describe("admin surface contracts", () => {
  it("uses live API-backed surfaces instead of static admin screens", () => {
    expect(routes).toContain('liveApiGet("/admin/tenants")');
    expect(routes).toContain("No compiler jobs have been created yet.");
    expect(routes).not.toContain(
      "No live records are connected for this page.",
    );
    for (const name of [
      "AdminDashboard",
      "JobQueue",
      "TenantDirectory",
      "ReceiptChain",
      "QuarantineReview",
      "AuditLog",
    ])
      expect(routes).not.toContain(name);
  });
  it("keeps shell destinations bounded and narrow-menu capable", () => {
    expect(shell).toContain('href: "/admin/jobs"');
    expect(shell).toContain('aria-controls="admin-navigation"');
    expect(shell).toContain('href="/projects/new"');
  });
});
