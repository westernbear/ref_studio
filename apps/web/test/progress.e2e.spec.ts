import { expect, test } from "@playwright/test";

test("@progress renders an empty live progress state without mock rows", async ({
  page,
}) => {
  await page.goto("/progress");
  await expect(
    page.getByRole("heading", { name: "Compiler Progress" }),
  ).toBeVisible();
  await expect(
    page.getByText("Choose a compiler job from Workflow to track progress."),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/JB-994A|42\.8|98\.2/u);
});
