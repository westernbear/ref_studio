import { expect, test } from "@playwright/test"

test.describe("upload validation @upload", () => {
  test("renders all upload controls and keeps compiler admission disabled", async ({ page }) => {
    await page.goto("/projects/new")
    await expect(page.locator("input[type=file]")).toBeAttached()
    await expect(page.getByRole("button", { name: /Proceed to Compiler/ })).toBeDisabled()
    await expect(page.locator('[data-control-id^="upload_validation:"]')).toHaveCount(13)
    await expect(page.getByText("Select an MP4 source to begin.")).toBeVisible()
  })
})
