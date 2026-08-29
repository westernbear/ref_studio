import {
  MotionDeliverablesV1Schema,
  MotionSceneSnapshotV1Schema,
} from "@rvs/contracts/motion";
import { getTranslations } from "next-intl/server";
import { Panel } from "../../../components/Primitives";
import { parseJobProgress } from "../../../lib/job-progress";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
} from "../../../lib/server-api";
import type { AcceptedMedia } from "../../../lib/upload-client";
import { Link } from "../../../i18n/navigation";
import { CompilerDialogue } from "./CompilerDialogue";
import { LegacyReviewStages } from "./LegacyReviewStages";
import { MotionWorkspace } from "./MotionWorkspace";
import { RenderJobButton } from "./RenderJobButton";
import { SceneReviewHeader } from "./SceneReviewHeader";

const list = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];
const numberValue = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const stringList = (value: unknown): readonly string[] =>
  list(value).filter((item): item is string => typeof item === "string");
export default async function SceneReviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly jobId?: string | readonly string[];
  }>;
}) {
  const t = await getTranslations("SceneReview");
  const params = await searchParams;
  const rawJobId = params.jobId;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  if (!jobId)
    return (
      <div className="upload-shell">
        <SceneReviewHeader />
        <main className="upload-main">
          <Panel>
            <h1>{t("title")}</h1>
            <p>{t("chooseJob")}</p>
            <Link className="button button-primary" href="/workflow">
              {t("header.workflow")}
            </Link>
          </Panel>
        </main>
      </div>
    );
  const [result, receiptsResult, motionResult, deliverablesResult] =
    await Promise.all([
      liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}`),
      liveApiGet(`/v1/receipts?jobId=${encodeURIComponent(jobId)}`),
      liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}/motion-scene`),
      liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}/deliverables`),
    ]);
  if (!result.ok)
    return (
      <div className="upload-shell">
        <SceneReviewHeader />
        <main className="upload-main">
          <Panel>
            <h1>{t("title")}</h1>
            <p>
              {isAuthProblem(result.code)
                ? t("signInToView")
                : t("unavailable", { code: result.code })}
            </p>
            {isAuthProblem(result.code) ? (
              <Link
                className="button button-primary"
                href={`/sign-in?returnTo=${encodeURIComponent(
                  `/scene-review?jobId=${jobId}`,
                )}`}
              >
                {t("signIn")}
              </Link>
            ) : (
              <Link className="button button-primary" href="/workflow">
                {t("header.workflow")}
              </Link>
            )}
          </Panel>
        </main>
      </div>
    );
  const uploadId = text(field(result.body, "uploadId"), "");
  const uploadResult = uploadId
    ? await liveApiGet(`/v1/uploads/${encodeURIComponent(uploadId)}`)
    : null;
  // GET /v1/uploads/:id spreads the media fields directly onto the response
  // body ({ uploadId, state, fps, frameCount, durationSeconds }) -- there is
  // no nested `.media` object.
  const acceptedMedia: AcceptedMedia | null =
    uploadResult?.ok && field(uploadResult.body, "fps")
      ? {
          uploadId,
          fps: numberValue(field(uploadResult.body, "fps")),
          frameCount: numberValue(field(uploadResult.body, "frameCount")),
          durationSeconds: numberValue(
            field(uploadResult.body, "durationSeconds"),
          ),
        }
      : null;

  const state = text(field(result.body, "state"));
  const preparationStage = text(field(result.body, "preparationStage"));
  const etag = text(field(result.body, "etag"), "");
  const attempt = numberValue(field(result.body, "attempt"));
  const approvedGates = stringList(field(result.body, "approvedGates"));
  const receipts = receiptsResult.ok ? items(receiptsResult.body) : [];
  const previewArtifactId = text(field(result.body, "previewArtifactId"), "");
  const startFrame = numberValue(field(result.body, "startFrame"));
  const sourceFps = numberValue(field(result.body, "sourceFps"));
  const sourceStart = sourceFps > 0 ? startFrame / sourceFps : 0;
  const sourceUrl = `/api/v1/jobs/${encodeURIComponent(
    jobId,
  )}/source-download#t=${sourceStart},${sourceStart + 4}`;
  const initialJob = parseJobProgress(result.body) ?? {
    id: jobId,
    state,
    preparationStage,
    attempt,
    updatedAt: "",
    artifactId: "",
    previewArtifactId,
    previewLabeledArtifactId: "",
    evidenceVideoArtifactId: "",
    failureCode: null,
    failureReason: null,
    progressPhase: "",
    progressStage: "",
    progressFraction: 0,
    framesProcessed: null,
    framesTotal: null,
    approvedGates: [],
    beatSheet: null,
  };
  const motionScene = motionResult.ok
    ? MotionSceneSnapshotV1Schema.safeParse(motionResult.body)
    : null;
  if (motionScene?.success) {
    const parsedDeliverables = deliverablesResult.ok
      ? MotionDeliverablesV1Schema.safeParse(deliverablesResult.body)
      : null;
    const deliverables = parsedDeliverables?.success
      ? parsedDeliverables.data
      : { backend: "native" as const, items: [] };
    return (
      <div className="upload-shell motion-workspace-shell">
        <SceneReviewHeader />
        <main className="motion-workspace-main">
          <MotionWorkspace
            initialJob={initialJob}
            initialScene={motionScene.data}
            initialDeliverables={deliverables}
          />
        </main>
      </div>
    );
  }

  return (
    <div className="upload-shell">
      <SceneReviewHeader />
      <main className="upload-main dialogue-main">
        <CompilerDialogue
          initialJob={initialJob}
          media={acceptedMedia}
          sourceUrl={sourceUrl}
          renderAction={
            state === "READY" && etag && approvedGates.includes("T4") ? (
              <RenderJobButton jobId={jobId} etag={etag} />
            ) : null
          }
        />
        <LegacyReviewStages
          jobId={jobId}
          state={state}
          attempt={attempt}
          receipts={receipts}
        />
      </main>
    </div>
  );
}
