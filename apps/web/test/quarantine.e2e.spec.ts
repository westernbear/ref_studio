import { expect, test } from "@playwright/test";

test("requires sign-in instead of rendering static quarantine rows @admin-quarantine", async ({
  page,
}) => {
  await page.goto("/admin/quarantine");
  await expect(page.getByRole("heading", { name: "Quarantine" })).toBeVisible();
  await expect(page.getByText("Admin sign-in required.")).toBeVisible();
  await expect(page.locator("[data-control-id]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/QT-\d/u);
});
