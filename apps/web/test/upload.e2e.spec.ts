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

  test("returns to sign-in when the upload session has expired", async ({
    page,
  }) => {
    // Given
    await page.route("**/api/v1/uploads", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 401,
        body: JSON.stringify({
          error: { code: "AUTHENTICATION_REQUIRED" },
        }),
      });
    });
    await page.goto("/projects/new");

    // When
    await page.setInputFiles("input[type=file]", {
      name: "clip.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from([
        0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109,
      ]),
    });

    // Then
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fprojects%2Fnew$/u);
  });

  test("uploads without crypto.randomUUID and routes to progress", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(globalThis.crypto, "randomUUID", {
        configurable: true,
        value: undefined,
      });
    });
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

  test("allows duplicate media to create separate compiler jobs", async ({
    page,
  }) => {
    let uploadCount = 0;
    const jobKeys: string[] = [];
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const uploadId = uploadCount === 0 ? "upl_first" : "upl_second";
      if (url.pathname === "/api/v1/uploads") {
        uploadCount += 1;
        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify({ upload: { id: uploadId } }),
        });
        return;
      }
      if (url.pathname.endsWith("/chunks")) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ upload: { id: uploadId } }),
        });
        return;
      }
      if (url.pathname.endsWith("/finalize")) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            upload: { id: uploadId, casObjectId: "cas_same" },
            fps: 30,
            frameCount: 120,
            durationSeconds: 4,
          }),
        });
        return;
      }
      if (url.pathname === "/api/v1/jobs") {
        jobKeys.push(route.request().headers()["idempotency-key"] ?? "");
        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify({ id: `job_${jobKeys.length}` }),
        });
        return;
      }
      await route.continue();
    });
    for (const jobId of ["job_1", "job_2"]) {
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
      await expect(page).toHaveURL(
        new RegExp(`/progress\\?jobId=${jobId}$`, "u"),
      );
    }
    expect(new Set(jobKeys).size).toBe(2);
  });

  test("does not show the safe-admission fallback on job errors", async ({
    page,
  }) => {
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/v1/uploads") {
        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify({ upload: { id: "upl_error" } }),
        });
        return;
      }
      if (url.pathname.endsWith("/chunks")) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ upload: { id: "upl_error" } }),
        });
        return;
      }
      if (url.pathname.endsWith("/finalize")) {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            upload: { id: "upl_error", casObjectId: "cas_error" },
            fps: 30,
            frameCount: 120,
            durationSeconds: 4,
          }),
        });
        return;
      }
      if (url.pathname === "/api/v1/jobs") {
        await route.fulfill({
          contentType: "application/json",
          status: 400,
          body: JSON.stringify({ error: { code: "INVALID_REQUEST" } }),
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
    await expect(
      page.getByText("The request could not be completed. Retry."),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/safely\s+admitted/u);
  });
});
