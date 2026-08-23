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
    const controlIds = await page
      .locator('[data-control-id^="upload_validation:"]')
      .evaluateAll((controls) =>
        controls.map((control) => control.getAttribute("data-control-id")),
      );
    expect(controlIds).toEqual([
      "upload_validation:1",
      "upload_validation:2",
      "upload_validation:5",
      "upload_validation:8",
      "upload_validation:9",
      "upload_validation:13",
    ]);
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
        expect(route.request().postDataJSON()).toEqual({
          fileName: "clip.mp4",
          mimeHint: "video/mp4",
          sizeBytes: 12,
        });
        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify({
            uploadId: "upl_redirect",
            chunkSize: 8_388_608,
            expiresAt: "2026-08-24T00:00:00.000Z",
            state: "PENDING",
          }),
        });
        return;
      }
      if (url.pathname === "/api/v1/uploads/upl_redirect/chunks/0") {
        expect(route.request().method()).toBe("PUT");
        expect(route.request().headers()["content-range"]).toBe(
          "bytes 0-11/12",
        );
        expect(route.request().headers()["x-chunk-sha256"]).toMatch(
          /^[a-f0-9]{64}$/u,
        );
        await route.fulfill({ status: 204 });
        return;
      }
      if (url.pathname === "/api/v1/uploads/upl_redirect/finalize") {
        expect(route.request().postDataJSON()).toMatchObject({
          orderedChunkCount: 1,
          declaredSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        });
        await route.fulfill({
          contentType: "application/json",
          status: 202,
          body: JSON.stringify({
            uploadId: "upl_redirect",
            state: "VALIDATING",
          }),
        });
        return;
      }
      if (url.pathname === "/api/v1/uploads/upl_redirect") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            uploadId: "upl_redirect",
            state: "ACCEPTED",
            fps: 30,
            frameCount: 120,
            durationSeconds: 4,
          }),
        });
        return;
      }
      if (url.pathname === "/api/v1/jobs") {
        expect(route.request().postDataJSON()).toEqual({
          uploadId: "upl_redirect",
          startFrame: 0,
          sourceFps: 30,
          outputProfile: "vertical-1080p30",
        });
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
      if (url.pathname === "/api/v1/uploads") {
        const uploadId = uploadCount++ === 0 ? "upl_first" : "upl_second";
        await route.fulfill({
          contentType: "application/json",
          status: 201,
          body: JSON.stringify({
            uploadId,
            chunkSize: 8_388_608,
            expiresAt: "2026-08-24T00:00:00.000Z",
            state: "PENDING",
          }),
        });
        return;
      }
      if (url.pathname.endsWith("/chunks/0")) {
        await route.fulfill({ status: 204 });
        return;
      }
      if (url.pathname.endsWith("/finalize")) {
        await route.fulfill({
          contentType: "application/json",
          status: 202,
          body: JSON.stringify({
            uploadId: url.pathname.split("/").at(-2),
            state: "VALIDATING",
          }),
        });
        return;
      }
      if (/\/api\/v1\/uploads\/upl_(first|second)$/u.test(url.pathname)) {
        const uploadId = url.pathname.split("/").at(-1);
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            uploadId,
            state: "ACCEPTED",
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
          body: JSON.stringify({
            uploadId: "upl_error",
            chunkSize: 8_388_608,
            expiresAt: "2026-08-24T00:00:00.000Z",
            state: "PENDING",
          }),
        });
        return;
      }
      if (url.pathname.endsWith("/chunks/0")) {
        await route.fulfill({ status: 204 });
        return;
      }
      if (url.pathname.endsWith("/finalize")) {
        await route.fulfill({
          contentType: "application/json",
          status: 202,
          body: JSON.stringify({ uploadId: "upl_error", state: "VALIDATING" }),
        });
        return;
      }
      if (url.pathname === "/api/v1/uploads/upl_error") {
        await route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            uploadId: "upl_error",
            state: "ACCEPTED",
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
