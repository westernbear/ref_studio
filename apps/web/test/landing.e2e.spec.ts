import { expect, test } from "@playwright/test";

test.describe("REF_STUDIO entry @workflow", () => {
  test("opens the landing page without jumping to workflow", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/u);
    await expect(
      page.getByRole("heading", { name: "REF_STUDIO" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Start Creating" }),
    ).toHaveAttribute("href", "/sign-in?returnTo=%2Fprojects%2Fnew");
    await expect(page.getByRole("link", { name: "Docs" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Support" })).toBeVisible();
    await expect(page.getByText("Temporal Evidence Extraction")).toBeVisible();
    await expect(page.getByText("Deterministic Browser Render")).toBeVisible();
    await expect(page.getByText("Semantic UI Portability")).toBeVisible();
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
