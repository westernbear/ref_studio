import { expect, test } from "@playwright/test";

test.describe("queue and delivery @jobs", () => {
  test("renders no static job rows", async ({ page }) => {
    await page.goto("/admin/jobs");
    await expect(
      page.getByRole("heading", { name: "Queue & Delivery" }),
    ).toBeVisible();
    await expect(
      page.getByText("No live records are connected for this page."),
    ).toBeVisible();
    await expect(page.locator("[data-control-id]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/RND-|Omni/u);
  });
});
