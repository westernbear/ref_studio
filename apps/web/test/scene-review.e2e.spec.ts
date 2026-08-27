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
