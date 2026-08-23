import { expect, test } from "@playwright/test";

test.describe("queue and delivery @jobs", () => {
  test("requires sign-in instead of rendering static job rows", async ({
    page,
  }) => {
    await page.goto("/admin/jobs");
    await expect(
      page.getByRole("heading", { name: "Queue & Delivery" }),
    ).toBeVisible();
    await expect(page.getByText("Admin sign-in required.")).toBeVisible();
    await expect(page.locator("[data-control-id]")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText(/RND-|Omni/u);
  });
});
