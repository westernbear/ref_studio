import { expect, test } from "@playwright/test";

test("requires sign-in instead of rendering static receipt rows @admin-receipts", async ({
  page,
}) => {
  await page.goto("/admin/receipts");
  await expect(
    page.getByRole("heading", { name: "Receipt chain" }),
  ).toBeVisible();
  await expect(page.getByText("Admin sign-in required.")).toBeVisible();
  await expect(page.locator("[data-control-id]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(/RC-\d/u);
});
