import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createCompletedGeneratedJob,
  createMotionCommandFixture,
} from "../../api/dist/apps/api/src/motion-scene-command-fixture.js";

const directory = mkdtempSync(join(tmpdir(), "rvs-motion-browser-"));
const videoPath = join(directory, "motion-workspace.mp4");
execFileSync("ffmpeg", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-f",
  "lavfi",
  "-i",
  "color=c=#101018:s=180x320:r=30",
  "-t",
  "2",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-y",
  videoPath,
]);

const patchSceneGenerate = async ({ prompt }) => {
  const prefix = "## Scene to amend (JSON)\n\n";
  const suffix = "\n\n## Creator's feedback";
  const start = prompt.indexOf(prefix) + prefix.length;
  const end = prompt.indexOf(suffix, start);
  const previous = JSON.parse(prompt.slice(start, end));
  const firstBeat = previous.beats[0];
  const firstElement = firstBeat?.elements[0];
  if (!firstBeat || !firstElement)
    throw new Error("browser fixture scene invalid");
  return {
    object: {
      spec: {
        ...previous,
        beats: [
          {
            ...firstBeat,
            elements: [
              { ...firstElement, content: "REFINED IN CHAT" },
              ...firstBeat.elements.slice(1),
            ],
          },
          ...previous.beats.slice(1),
        ],
      },
      summary: "Updated the opening title",
    },
  };
};

const fixture = createMotionCommandFixture(directory, {
  expectedOrigin: process.env.RVS_BROWSER_ORIGIN ?? "http://127.0.0.1:3100",
  patchSceneGenerate,
});
const jobId = await createCompletedGeneratedJob(fixture);
fixture.auth.sessions.push({
  id: "motion-browser-session",
  userId: "usr_a",
  tenantId: "ten_a",
  expiresAt: 1_000 + 30 * 60 * 1_000,
  createdAt: 1_000,
  revokedAt: null,
});

const videoBytes = readFileSync(videoPath);
fixture.workflow.artifacts.set("artifact-safe", {
  id: "artifact-safe",
  jobId,
  tenantId: "ten_a",
  kind: "generated-delivery",
  filename: "motion-workspace.mp4",
  contentType: "video/mp4",
  bytes: videoBytes,
  sha256: createHash("sha256").update(videoBytes).digest("hex"),
  sizeBytes: videoBytes.byteLength,
  createdAt: "2026-08-29T00:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  report: null,
});
const scenePackage = Buffer.from("motion workspace scene package fixture");
fixture.workflow.scenePackages.set(jobId, {
  id: "scene-package-safe",
  jobId,
  tenantId: "ten_a",
  kind: "scene-package",
  filename: "motion-workspace.tar",
  contentType: "application/x-tar",
  bytes: scenePackage,
  sha256: createHash("sha256").update(scenePackage).digest("hex"),
  sizeBytes: scenePackage.byteLength,
  createdAt: "2026-08-29T00:00:00.000Z",
  expiresAt: "2099-01-01T00:00:00.000Z",
  report: null,
});

const completionTimer = setInterval(() => {
  const job = fixture.workflow.jobs.get(jobId);
  if (job?.state === "QUEUED") {
    job.state = "COMPLETED";
    job.progress = {
      phase: "render",
      stage: "delivery-qc",
      fraction: 1,
      framesProcessed: 600,
      framesTotal: 600,
    };
    job.updatedAt = new Date(fixture.workflow.now()).toISOString();
  }
}, 500);

const close = async () => {
  clearInterval(completionTimer);
  await fixture.app.close();
  fixture.db.close();
  rmSync(directory, { recursive: true, force: true });
};
process.once("SIGINT", () => void close().finally(() => process.exit(0)));
process.once("SIGTERM", () => void close().finally(() => process.exit(0)));

await fixture.app.listen({ host: "127.0.0.1", port: 3199 });
console.log(`motion-browser-fixture http://127.0.0.1:3199 ${jobId}`);
