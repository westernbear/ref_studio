import { expect, test } from "@playwright/test";

test("requires sign-in instead of rendering static tenant rows @admin-tenants", async ({
  page,
}) => {
  await page.goto("/admin/tenants");
  await expect(page.getByRole("heading", { name: "Tenants" })).toBeVisible();
  await expect(page.getByText("Admin sign-in required.")).toBeVisible();
  await expect(page.locator("[data-control-id]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/Aegis|Nakamura/u);
});
