import { expect, test } from "@playwright/test"

test("@scene-review enforces evidence, authority, and the T1-T5 predecessor chain", async ({ page }) => {
  await page.goto("/scene-review")
  await expect(page.getByRole("heading", { name: "Scene Review" })).toBeVisible()
  await expect(page.locator("[data-control-id^='scene_review_approval:']")).toHaveCount(18)
  await expect(page.locator("[data-control-id^='scene_review_approval:']").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-control-id")))).resolves.toEqual(Array.from({ length: 18 }, (_, index) => `scene_review_approval:${index + 1}`))
  await page.getByRole("button", { name: "Notifications" }).click()
  await expect(page.locator(".review-notice")).toContainText("No new notifications")
  await page.getByRole("slider", { name: "Source frame scrubber" }).fill("77")
  await expect(page.locator("output")).toHaveText("077 / 119")

  await page.getByRole("button", { name: /Street_Debris_Scatter/ }).click()
  await expect(page.getByRole("button", { name: "Approve T1" })).toBeDisabled()
  await page.getByRole("dialog").getByRole("button", { name: "Background" }).click()
  await expect(page.getByRole("button", { name: "Approve T1" })).toBeDisabled()
  await page.getByRole("button", { name: "Re-review current snapshot" }).click()

  await page.getByRole("button", { name: "Role: Designated reviewer" }).click()
  await expect(page.getByRole("button", { name: "Approve T1" })).toBeDisabled()
  await page.getByRole("button", { name: "Role: Admin viewer" }).click()
  await page.getByRole("button", { name: "Approve T1" }).click()
  await expect(page.getByText("1 append-only receipts")).toBeVisible()
  await page.getByRole("button", { name: "Role: Designated reviewer" }).click()
  await expect(page.getByRole("button", { name: "Approve T2" })).toBeDisabled()
  await page.getByRole("button", { name: "Role: Admin viewer" }).click()

  for (const gate of ["T2", "T3", "T4", "T5"]) {
    await expect(page.getByText(`Current gate: ${gate}`)).toBeVisible()
    await page.getByRole("button", { name: `Approve ${gate}` }).click()
    await expect(page.getByText(`${gate === "T5" ? 5 : Number(gate.slice(1))} append-only receipts`)).toBeVisible()
  }
  await expect(page.getByRole("button", { name: "Launch final render" })).toBeEnabled()
})
