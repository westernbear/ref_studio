import { expect, test } from "@playwright/test";

test("@scene-review renders no static review evidence", async ({ page }) => {
  await page.goto("/scene-review");
  await expect(
    page.getByRole("heading", { name: "Scene Review" }),
  ).toBeVisible();
  await expect(
    page.getByText("No live scene review is connected yet."),
  ).toBeVisible();
  await expect(page.locator("[data-control-id]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /Street_Debris|Main_Facade|Signage/u,
  );
});
