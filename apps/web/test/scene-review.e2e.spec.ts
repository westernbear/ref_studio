import { expect, test } from "@playwright/test";

test("@scene-review renders no static review evidence", async ({ page }) => {
  await page.goto("/scene-review");
  await expect(
    page.getByRole("heading", { name: "Scene Review" }),
  ).toBeVisible();
  await expect(
    page.getByText("Choose a compiler job from Workflow to review."),
  ).toBeVisible();
  await expect(page.locator("[data-control-id]")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(
    /Street_Debris|Main_Facade|Signage/u,
  );
});

// Task 3.3 gives a scene-authoring job a beat sheet (job.authoredScene) once
// scene authoring finishes -- authoring runs in the API itself, not as a
// worker phase; the dialogue reads the result back off
// GET /v1/jobs/:jobId as `beatSheet` (see apps/api/src/creator-workflow.ts's
// projection() and apps/web/src/lib/job-progress.ts's parseJobProgress) and
// shows it as a `role: "beats"` chat message (CompilerDialogue.tsx).
//
// NOTE: this mocks only the browser-driven poll to /api/v1/jobs/:jobId --
// the first render of /scene-review comes from an authenticated
// server-side fetch (SceneReviewPage's liveApiGet) that Playwright's
// page.route cannot intercept, and this repo's e2e harness has no fixture
// for a signed-in session or a seeded backend job. See the batch report for
// why this test cannot be verified to pass in this sandbox.
const authoredJobId = "job_authored_beats";
const authoredBeatSheet = [
  { beatId: "beat-open", shot: "push-in", words: "REF STUDIO" },
  { beatId: "beat-hero", shot: "hard-cut", words: "" },
  { beatId: "beat-close", shot: "ring-expand", words: "GENERATE THE FRAME" },
];

test("shows the beat sheet when authoring finishes", async ({ page }) => {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/v1/jobs/${authoredJobId}`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: authoredJobId,
          state: "READY",
          preparationStage: "READY",
          attempt: 1,
          approvedGates: ["T1", "T2", "T3", "T4"],
          beatSheet: authoredBeatSheet,
        }),
      });
      return;
    }
    if (url.pathname === `/api/v1/receipts`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`/ko-KR/scene-review?jobId=${authoredJobId}`);
  await expect(page.getByTestId("beat-sheet")).toBeVisible();
  await expect(
    page.getByTestId("beat-sheet").getByRole("listitem"),
  ).toHaveCount(3);
});

// Chat edit loop: on a generate-track job, POST /refine-prompt returns a
// scene patch ({changedBeatIds, beatSheet, summary}) instead of start-frame
// proposals (CompilerDialogue.tsx's send()). This proves the chat shows what
// the AI understood (the summary), which beats changed, that a new render
// started, and that the beat sheet updates in place rather than growing a
// second stale copy.
//
// Same limitation as the test above (unauthenticated server-side first
// render, no seeded backend job) -- this cannot be verified to pass in this
// sandbox; see the batch report.
const patchJobId = "job_scene_patch";

test("shows what changed after a scene-patch chat reply, and updates the beat sheet in place", async ({
  page,
}) => {
  let refineCalls = 0;
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (
      url.pathname === `/api/v1/jobs/${patchJobId}` &&
      route.request().method() === "GET"
    ) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: patchJobId,
          state: "COMPLETED",
          preparationStage: "READY",
          attempt: 1,
          approvedGates: ["T1", "T2", "T3", "T4", "T5"],
          beatSheet: [
            { beatId: "beat-open", shot: "push-in", words: "REF STUDIO" },
          ],
        }),
      });
      return;
    }
    if (
      url.pathname === `/api/v1/jobs/${patchJobId}/refine-prompt` &&
      route.request().method() === "POST"
    ) {
      refineCalls += 1;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          changedBeatIds: ["beat-open"],
          beatSheet: [
            { beatId: "beat-open", shot: "push-in", words: "MERIDIAN" },
          ],
          summary: "Changed the headline copy.",
        }),
      });
      return;
    }
    if (url.pathname === `/api/v1/receipts`) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ items: [] }),
      });
      return;
    }
    await route.continue();
  });
  await page.goto(`/en-US/scene-review?jobId=${patchJobId}`);
  await expect(page.getByTestId("beat-sheet")).toContainText("REF STUDIO");
  await page
    .getByLabel("Change the result")
    .fill("use MERIDIAN as the headline");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Changed the headline copy.")).toBeVisible();
  await expect(page.getByText("Changed beats: beat-open")).toBeVisible();
  await expect(page.getByText("A new render has started.")).toBeVisible();
  // Updated in place -- one beat sheet, showing the new copy, not two.
  await expect(page.getByTestId("beat-sheet")).toHaveCount(1);
  await expect(page.getByTestId("beat-sheet")).toContainText("MERIDIAN");
  await expect(page.getByTestId("beat-sheet")).not.toContainText("REF STUDIO");
  expect(refineCalls).toBe(1);
});
