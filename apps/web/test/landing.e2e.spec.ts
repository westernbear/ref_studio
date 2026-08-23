import { expect, test } from "@playwright/test";

test.describe("REF_STUDIO entry @workflow", () => {
  test("opens the live workflow and reports health", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/workflow$/u);
    await expect(page.getByRole("heading", { name: "Workflow" })).toBeVisible();
    await expect(page.getByTestId("brand-logo").first()).toBeVisible();
    await expect(
      page.locator('a[href="/docs"], a[href="/support"]'),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const health = await request.get("/health");
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).status).toBe("ok");
  });

  test("does not expose placeholder destinations", async ({ request }) => {
    for (const path of ["/docs", "/support", "/api", "/legal", "/privacy"])
      expect((await request.get(path)).status()).toBe(404);
  });
});
