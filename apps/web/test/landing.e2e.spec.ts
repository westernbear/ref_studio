import { expect, test } from "@playwright/test";

test.describe("REF_STUDIO landing @landing", () => {
  test("renders primary controls and reports health", async ({
    page,
    request,
  }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "REF_STUDIO" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Workflow" })).toHaveAttribute(
      "href",
      "/workflow",
    );
    await expect(page.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin",
    );
    await expect(page.getByRole("link", { name: "Docs" })).toHaveAttribute(
      "href",
      "/docs",
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const health = await request.get("/health");
    expect(health.ok()).toBeTruthy();
    expect((await health.json()).status).toBe("ok");
  });

  test("keeps public destinations bounded", async ({ page }) => {
    for (const path of [
      "/workflow",
      "/admin",
      "/docs",
      "/support",
      "/api",
      "/legal",
      "/privacy",
    ]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await expect(page).not.toHaveTitle(/404|Error/i);
    }
  });

  test("uses the sign-in return URL without a session and upload with a session", async ({
    page,
    context,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Start Creating" }).click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fprojects%2Fnew$/);
    await context.addCookies([
      {
        name: "rvs_session",
        value: "session-token",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await page.goto("/");
    await page.getByRole("button", { name: "New Project" }).click();
    await expect(page).toHaveURL(/\/projects\/new$/);
  });
});
