import { expect, test } from "@playwright/test";

const legacyText = /Aegis|Aethelgard|Omni|RND-|RC-|QT-|tenant_alpha/u;

test.describe("admin shell and dashboard @admin-dashboard @admin-shell", () => {
  test("shows live empty state and narrow navigation", async ({ page }) => {
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "Admin dashboard" }),
    ).toBeVisible();
    await expect(page.getByText("Platform scope · Operations")).toBeVisible();
    await expect(
      page.getByText("No live records are connected for this page."),
    ).toBeVisible();
    await expect(
      page.locator('[data-control-id^="admin_"], [data-control-id^="job_"]'),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(legacyText);
    await page.setViewportSize({ width: 520, height: 800 });
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(
      page.getByRole("link", { name: "Jobs", exact: true }),
    ).toHaveAttribute("href", "/admin/jobs");
  });
});

for (const [route, heading] of [
  ["/admin/jobs", "Queue & Delivery"],
  ["/admin/tenants", "Tenants"],
  ["/admin/receipts", "Receipt chain"],
  ["/admin/quarantine", "Quarantine"],
  ["/admin/audit", "Audit log"],
] as const) {
  test(`shows empty live state for ${route}`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    await expect(
      page.getByText("No live records are connected for this page."),
    ).toBeVisible();
    await expect(
      page.locator('[data-control-id^="admin_"], [data-control-id^="job_"]'),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(legacyText);
  });
}
