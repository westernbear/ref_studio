import { expect, test } from "@playwright/test";

const fixtureClip = {
  name: "clip.mp4",
  mimeType: "video/mp4",
  buffer: Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]),
};

test("submits a brief with duration and aspect", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/uploads") {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({
          uploadId: "upl_brief",
          chunkSize: 8_388_608,
          expiresAt: "2026-08-24T00:00:00.000Z",
          state: "PENDING",
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/uploads/upl_brief/chunks/0") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (url.pathname === "/api/v1/uploads/upl_brief/finalize") {
      await route.fulfill({
        contentType: "application/json",
        status: 202,
        body: JSON.stringify({ uploadId: "upl_brief", state: "VALIDATING" }),
      });
      return;
    }
    if (url.pathname === "/api/v1/uploads/upl_brief") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          uploadId: "upl_brief",
          state: "ACCEPTED",
          fps: 30,
          frameCount: 120,
          durationSeconds: 4,
        }),
      });
      return;
    }
    if (url.pathname === "/api/v1/jobs") {
      expect(route.request().postDataJSON()).toMatchObject({
        uploadId: "upl_brief",
        generation: {
          brief: "신발 광고, 브랜드 X, 가을 신상",
          durationSec: 20,
          aspect: "9:16",
          attachmentIds: [],
        },
      });
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ id: "job_brief" }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto("/ko-KR/projects/new");
  await page.setInputFiles("#reference-file", fixtureClip);
  await expect(page.getByText("영상 형식을 맞췄습니다")).toBeVisible();
  await page.fill("#creative-prompt", "신발 광고, 브랜드 X, 가을 신상");
  await page.selectOption("#duration", "20");
  await page.selectOption("#aspect", "9:16");
  await page.click("#submit");
  await expect(page).toHaveURL(/\/progress\?jobId=/);
});
