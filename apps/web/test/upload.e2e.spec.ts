import { expect, test } from "@playwright/test";

test.describe("upload validation @upload", () => {
  test("renders all upload controls and keeps compiler admission disabled", async ({
    page,
  }) => {
    await page.goto("/projects/new");
    await expect(page.locator("input[type=file]")).toBeAttached();
    await expect(
      page.getByRole("button", { name: /Proceed to Compiler/ }),
    ).toBeDisabled();
    await expect(
      page.locator('[data-control-id^="upload_validation:"]'),
    ).toHaveCount(11);
    await expect(
      page.getByText("Select an MP4 source to begin."),
    ).toBeVisible();
  });

  test("routes to progress after compiler job creation", async ({ page }) => {
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v1/uploads") {
        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify({ upload: { id: "upl_redirect" } }),
        });
        return;
      }
      if (url.pathname === "/api/v1/uploads/upl_redirect/chunks") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ upload: { id: "upl_redirect" } }),
        });
        return;
      }
      if (url.pathname === "/api/v1/uploads/upl_redirect/finalize") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            upload: { id: "upl_redirect", casObjectId: "cas_redirect" },
            fps: 30,
            frameCount: 120,
            durationSeconds: 4,
            normalizedDigest: "digest_redirect",
          }),
        });
        return;
      }
      if (url.pathname === "/api/v1/jobs") {
        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify({ id: "job_redirect" }),
        });
        return;
      }
      await route.continue();
    });
    await page.goto("/projects/new");
    await page.setInputFiles("input[type=file]", {
      name: "clip.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from([
        0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109,
      ]),
    });
    await expect(page.getByText("Accepted normalized media.")).toBeVisible();
    await page.getByRole("button", { name: /Proceed to Compiler/ }).click();
    await expect(page).toHaveURL(/\/progress\?jobId=job_redirect$/u);
  });
});
