import { expect, test, type Page } from "@playwright/test";

const fixtureClip = {
  name: "clip.mp4",
  mimeType: "video/mp4",
  buffer: Buffer.from([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109]),
};

// Shared upload-flow mocking: every test needs the same upload/finalize/poll
// sequence before it can reach the "submit" button; only the /api/v1/jobs
// assertion differs per test.
const mockUploadFlow = async (
  page: Page,
  uploadId: string,
  onJobsRequest: (postData: unknown) => void,
) => {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/uploads") {
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
    if (url.pathname === `/api/v1/uploads/${uploadId}/chunks/0`) {
      await route.fulfill({ status: 204 });
      return;
    }
    if (url.pathname === `/api/v1/uploads/${uploadId}/finalize`) {
      await route.fulfill({
        contentType: "application/json",
        status: 202,
        body: JSON.stringify({ uploadId, state: "VALIDATING" }),
      });
      return;
    }
    if (url.pathname === `/api/v1/uploads/${uploadId}`) {
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
      onJobsRequest(route.request().postDataJSON());
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ id: `job_${uploadId}` }),
      });
      return;
    }
    if (url.pathname === "/api/v1/attachments") {
      await route.fulfill({
        contentType: "application/json",
        status: 201,
        body: JSON.stringify({ attachmentId: "att_e2e" }),
      });
      return;
    }
    await route.continue();
  });
};

// C4: the generate track is an explicit, visible choice (default: restore).
// This proves the restore path is untouched -- typing into the same
// creative-intent textarea that always fed AI start-frame selection must
// still produce a plain `prompt`, never a `generation`, when the track is
// left at its default.
test("a restore-track submit sends prompt, not generation", async ({
  page,
}) => {
  let jobBody: unknown;
  await mockUploadFlow(page, "upl_restore", (body) => {
    jobBody = body;
  });
  await page.goto("/ko-KR/projects/new");
  await page.setInputFiles("#reference-file", fixtureClip);
  await expect(page.getByText("영상 형식을 맞췄습니다")).toBeVisible();
  await page.fill("#creative-prompt", "로고는 코너에 그대로 둬 주세요");
  await page.click("#submit");
  await expect(page).toHaveURL(/\/progress\?jobId=/);
  expect(jobBody).toMatchObject({
    uploadId: "upl_restore",
    prompt: "로고는 코너에 그대로 둬 주세요",
  });
  expect(jobBody).not.toHaveProperty("generation");
});

// The generate track only activates once the creator explicitly picks it;
// duration/aspect/attachment controls only appear then too (C4.4).
test("a generate-track submit sends generation with duration and aspect", async ({
  page,
}) => {
  let jobBody: unknown;
  await mockUploadFlow(page, "upl_brief", (body) => {
    jobBody = body;
  });
  await page.goto("/ko-KR/projects/new");
  await page.setInputFiles("#reference-file", fixtureClip);
  await expect(page.getByText("영상 형식을 맞췄습니다")).toBeVisible();
  await page.selectOption("#creative-track", "generate");
  await page.fill("#creative-prompt", "신발 광고, 브랜드 X, 가을 신상");
  await page.selectOption("#duration", "20");
  await page.selectOption("#aspect", "9:16");
  await page.click("#submit");
  await expect(page).toHaveURL(/\/progress\?jobId=/);
  expect(jobBody).toMatchObject({
    uploadId: "upl_brief",
    generation: {
      brief: "신발 광고, 브랜드 X, 가을 신상",
      durationSec: 20,
      aspect: "9:16",
      attachmentIds: [],
    },
  });
});

// I1: video/mp4 is in the attachment allowlist and must actually be able to
// upload -- app.ts's video content-type parsers previously had no
// `parseAs`, so the body arrived as a raw stream and was rejected before
// ever reaching the magic-byte sniff.
test("an mp4 attachment uploads end to end on the generate track", async ({
  page,
}) => {
  let jobBody: unknown;
  let attachmentContentType: string | undefined;
  await mockUploadFlow(page, "upl_mp4_attachment", (body) => {
    jobBody = body;
  });
  await page.route("**/api/v1/attachments", async (route) => {
    attachmentContentType = route.request().headers()["content-type"];
    await route.fulfill({
      contentType: "application/json",
      status: 201,
      body: JSON.stringify({ attachmentId: "att_brand_video" }),
    });
  });
  await page.goto("/ko-KR/projects/new");
  await page.setInputFiles("#reference-file", fixtureClip);
  await expect(page.getByText("영상 형식을 맞췄습니다")).toBeVisible();
  await page.selectOption("#creative-track", "generate");
  await page.fill("#creative-prompt", "브랜드 영상을 참고해 주세요");
  await page.setInputFiles("#attachment-file", {
    name: "brand.mp4",
    mimeType: "video/mp4",
    buffer: fixtureClip.buffer,
  });
  await page.click("#submit");
  await expect(page).toHaveURL(/\/progress\?jobId=/);
  expect(attachmentContentType).toBe("video/mp4");
  expect(jobBody).toMatchObject({
    generation: { attachmentIds: ["att_brand_video"] },
  });
});

// I1.3/I1.4: a rejected attachment must surface its own reason, not the
// generic "request failed, retry" fallback that swallowed every UploadFailure
// code the client didn't already know by name.
test("a rejected attachment shows its own reason instead of a generic one", async ({
  page,
}) => {
  await mockUploadFlow(page, "upl_bad_attachment", () => {
    throw new Error("must not create a job when the attachment was rejected");
  });
  await page.route("**/api/v1/attachments", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 400,
      body: JSON.stringify({ error: { code: "ATTACHMENT_TYPE_INVALID" } }),
    });
  });
  await page.goto("/ko-KR/projects/new");
  await page.setInputFiles("#reference-file", fixtureClip);
  await expect(page.getByText("영상 형식을 맞췄습니다")).toBeVisible();
  await page.selectOption("#creative-track", "generate");
  await page.fill("#creative-prompt", "브랜드 자산을 참고해 주세요");
  await page.setInputFiles("#attachment-file", {
    name: "bad.exe",
    mimeType: "application/octet-stream",
    buffer: Buffer.from("not a real attachment"),
  });
  await page.click("#submit");
  await expect(
    page.getByText("참고 파일 중 지원되지 않는 형식이 있습니다"),
  ).toBeVisible();
});
