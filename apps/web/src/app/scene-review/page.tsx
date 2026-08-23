import { CreatorShell } from "../../components/Shells";
import { Panel } from "../../components/Primitives";
import {
  field,
  isAuthProblem,
  items,
  liveApiGet,
  text,
  when,
} from "../../lib/server-api";
import { RenderJobButton } from "./RenderJobButton";
import { ReviewGateControls } from "./ReviewGateControls";

const gates = ["T1", "T2", "T3", "T4", "T5"] as const;
type Gate = (typeof gates)[number];

const list = (value: unknown): readonly unknown[] =>
  Array.isArray(value) ? value : [];
const stringList = (value: unknown): readonly string[] =>
  list(value).filter((item): item is string => typeof item === "string");
const numberValue = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const keys = (value: unknown): readonly string[] =>
  value && typeof value === "object" ? Object.keys(value) : [];
const ready = (value: unknown): string =>
  value === true ? "Ready" : "Not ready";
const receiptFor = (
  receipts: readonly unknown[],
  gate: Gate,
  attempt: number,
): unknown =>
  [...receipts]
    .reverse()
    .find(
      (receipt) =>
        text(field(receipt, "gate"), "") === gate &&
        text(field(receipt, "decision"), "") === "APPROVED" &&
        numberValue(field(receipt, "attempt")) === attempt,
    );
const latestReceiptFor = (
  receipts: readonly unknown[],
  gate: Gate,
  attempt: number,
): unknown =>
  [...receipts]
    .reverse()
    .find(
      (receipt) =>
        text(field(receipt, "gate"), "") === gate &&
        numberValue(field(receipt, "attempt")) === attempt,
    );

function Detail({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default async function SceneReviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly jobId?: string | readonly string[];
  }>;
}) {
  const params = await searchParams;
  const rawJobId = params.jobId;
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  if (!jobId)
    return (
      <CreatorShell>
        <Panel>
          <h1>Scene Review</h1>
          <p>Choose a compiler job from Workflow to review.</p>
          <a className="button button-primary" href="/workflow">
            Workflow
          </a>
        </Panel>
      </CreatorShell>
    );
  const [result, evidenceResult, receiptsResult] = await Promise.all([
    liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}`),
    liveApiGet(`/v1/jobs/${encodeURIComponent(jobId)}/evidence`),
    liveApiGet(`/v1/receipts?jobId=${encodeURIComponent(jobId)}`),
  ]);
  if (!result.ok)
    return (
      <CreatorShell>
        <Panel>
          <h1>Scene Review</h1>
          <p>
            {isAuthProblem(result.code)
              ? "Sign in to view this compiler job."
              : `Compiler job is unavailable: ${result.code}.`}
          </p>
          {isAuthProblem(result.code) ? (
            <a
              className="button button-primary"
              href={`/sign-in?returnTo=${encodeURIComponent(
                `/scene-review?jobId=${jobId}`,
              )}`}
            >
              Sign in
            </a>
          ) : (
            <a className="button button-primary" href="/workflow">
              Workflow
            </a>
          )}
        </Panel>
      </CreatorShell>
    );
  const state = text(field(result.body, "state"));
  const etag = text(field(result.body, "etag"), "");
  const attempt = numberValue(field(result.body, "attempt"));
  const approvedGates = stringList(field(result.body, "approvedGates"));
  const receipts = receiptsResult.ok ? items(receiptsResult.body) : [];
  const previewArtifactId = text(field(result.body, "previewArtifactId"), "");
  const reviewArtifactId = text(field(result.body, "reviewArtifactId"), "");
  const evidenceDigest = text(field(result.body, "evidenceDigest"), "");
  const irDigest = text(field(result.body, "irDigest"), "");
  const runtimeDigest = text(field(result.body, "runtimeDigest"), "");
  const releaseBaselineDigest = text(
    field(result.body, "releaseBaselineDigest"),
    "",
  );
  const runtime = field(result.body, "runtimePreflight");
  const nextGate: Gate | null =
    state === "AWAITING_T5"
      ? "T5"
      : state === "READY"
        ? (gates.slice(0, 4).find((gate) => !approvedGates.includes(gate)) ??
          null)
        : null;
  const predecessorGate = nextGate
    ? gates[gates.indexOf(nextGate) - 1]
    : undefined;
  const predecessorReceiptId = predecessorGate
    ? text(field(receiptFor(receipts, predecessorGate, attempt), "id"), "") ||
      null
    : null;
  const artifactRefs =
    nextGate === "T3" || nextGate === "T4"
      ? previewArtifactId
        ? [previewArtifactId]
        : []
      : nextGate === "T5" && reviewArtifactId
        ? [reviewArtifactId]
        : [];
  const canReview =
    nextGate !== null &&
    Boolean(
      evidenceDigest &&
        irDigest &&
        runtimeDigest &&
        releaseBaselineDigest &&
        text(field(runtime, "status"), "") === "PASS" &&
        (nextGate === "T1" || predecessorReceiptId) &&
        (!["T3", "T4", "T5"].includes(nextGate) || artifactRefs.length > 0),
    );
  const evidence = evidenceResult.ok ? evidenceResult.body : null;
  const sceneInput = field(evidence, "sceneInput");
  const owners = list(field(sceneInput, "owners"));
  const tracks = list(field(sceneInput, "tracks"));
  const mappings = field(evidence, "mappings");
  const observed = field(evidence, "observed");
  const temporalVolume = field(observed, "temporalVolume");
  const startFrame = numberValue(field(result.body, "startFrame"));
  const sourceFps = numberValue(field(result.body, "sourceFps"));
  const sourceStart = sourceFps > 0 ? startFrame / sourceFps : 0;
  const sourceUrl = `/api/v1/jobs/${encodeURIComponent(
    jobId,
  )}/source-download#t=${sourceStart},${sourceStart + 4}`;
  return (
    <CreatorShell>
      <div className="live-stack">
        <div className="page-title">
          <div>
            <h1>Scene Review</h1>
            <p>Measured evidence, render preview, and approval receipts.</p>
          </div>
          <a
            className="button button-primary"
            href={`/progress?jobId=${encodeURIComponent(jobId)}`}
          >
            Progress
          </a>
        </div>
        <Panel>
          <dl className="detail-grid">
            <Detail label="Job" value={text(field(result.body, "id"))} />
            <Detail label="State" value={state} />
            <Detail
              label="Attempt"
              value={text(field(result.body, "attempt"), "0")}
            />
            <Detail
              label="Created"
              value={when(field(result.body, "createdAt"))}
            />
            <Detail
              label="Updated"
              value={when(field(result.body, "updatedAt"))}
            />
            <Detail
              label="Approved gates"
              value={`${approvedGates.length}/6`}
            />
            <Detail
              label="Runtime"
              value={text(field(runtime, "chromiumVersion"), "Pending")}
            />
          </dl>
          {state === "READY" && etag && approvedGates.includes("T4") ? (
            <RenderJobButton jobId={jobId} etag={etag} />
          ) : null}
          {state === "COMPLETED" ? (
            <div className="review-actions">
              <a
                className="button button-primary"
                href={`/api/v1/jobs/${encodeURIComponent(jobId)}/delivery-download`}
              >
                Download Delivery
              </a>
              <a
                className="button"
                href={`/api/v1/jobs/${encodeURIComponent(jobId)}/report-download`}
              >
                Download Report
              </a>
            </div>
          ) : null}
        </Panel>
        <section className="review-media-section" aria-labelledby="media-title">
          <div className="section-heading">
            <div>
              <h2 id="media-title">Reference and animatic</h2>
              <p>Selected source interval and worker-rendered review output.</p>
            </div>
          </div>
          <div className="review-media-grid">
            <figure>
              <video controls preload="metadata" playsInline src={sourceUrl} />
              <figcaption>Reference source</figcaption>
            </figure>
            <figure>
              {previewArtifactId ? (
                <video
                  controls
                  preload="metadata"
                  playsInline
                  src={`/api/v1/jobs/${encodeURIComponent(jobId)}/preview-download`}
                />
              ) : (
                <div className="review-media-pending">Preview pending</div>
              )}
              <figcaption>Frame-indexed animatic</figcaption>
            </figure>
          </div>
        </section>
        <Panel>
          <div className="section-heading">
            <div>
              <h2>Compiler evidence</h2>
              <p>Observed temporal measurements mapped to editable owners.</p>
            </div>
          </div>
          {evidence ? (
            <>
              <dl className="metric-grid">
                <Detail
                  label="Evidence"
                  value={text(field(evidence, "state"))}
                />
                <Detail
                  label="Preflight"
                  value={text(field(runtime, "status"), "Pending")}
                />
                <Detail
                  label="Renderer"
                  value={text(field(runtime, "renderer"), "Pending")}
                />
                <Detail
                  label="WebGL2 / Font"
                  value={`${ready(field(runtime, "webgl2"))} / ${ready(
                    field(runtime, "fontReady"),
                  )}`}
                />
                <Detail
                  label="Network"
                  value={text(field(runtime, "networkPolicy"), "Pending")}
                />
                <Detail
                  label="Frames"
                  value={text(field(temporalVolume, "frameCount"), "0")}
                />
                <Detail
                  label="Text owners"
                  value={text(field(mappings, "textOwnerCount"), "0")}
                />
                <Detail
                  label="UI owners"
                  value={text(field(mappings, "uiOwnerCount"), "0")}
                />
                <Detail
                  label="Needs choice"
                  value={String(list(field(evidence, "needsChoice")).length)}
                />
                <Detail
                  label="Effects"
                  value={String(keys(field(sceneInput, "effects")).length)}
                />
              </dl>
              <div className="table-wrap review-evidence-table">
                <table className="live-table">
                  <thead>
                    <tr>
                      <th>Owner</th>
                      <th>Kind</th>
                      <th>Confidence</th>
                      <th>Lifecycle</th>
                      <th>Effects</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owners.map((owner, index) => {
                      const ownerId = text(
                        field(owner, "ownerId"),
                        `owner-${index}`,
                      );
                      const track = tracks.find(
                        (candidate) =>
                          text(field(candidate, "owner"), "") === ownerId,
                      );
                      const confidence = numberValue(
                        field(owner, "confidence"),
                      );
                      return (
                        <tr key={ownerId}>
                          <td className="id-cell">
                            <strong>{ownerId}</strong>
                          </td>
                          <td>{text(field(owner, "kind"))}</td>
                          <td>{`${(confidence * 100).toFixed(1)}%`}</td>
                          <td>
                            {keys(field(track, "lifecycle")).join(" / ") ||
                              "Not set"}
                          </td>
                          <td>
                            {stringList(field(track, "effects")).join(", ") ||
                              "None"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="empty-copy">Compiler evidence is still pending.</p>
          )}
        </Panel>
        <Panel>
          <div className="section-heading">
            <div>
              <h2>Approval chain</h2>
              <p>Append-only decisions for the current attempt.</p>
            </div>
          </div>
          <ol className="review-gate-chain">
            {gates.map((gate) => {
              const receipt = latestReceiptFor(receipts, gate, attempt);
              const decision = text(field(receipt, "decision"), "Pending");
              return (
                <li
                  key={gate}
                  className={
                    decision === "APPROVED"
                      ? "is-approved"
                      : decision === "REJECTED"
                        ? "is-rejected"
                        : ""
                  }
                >
                  <strong>{gate}</strong>
                  <span>{decision}</span>
                  <small>
                    {receipt
                      ? `${text(field(receipt, "actorId"))} / ${when(field(receipt, "createdAt"))}`
                      : "No receipt"}
                  </small>
                </li>
              );
            })}
          </ol>
          {canReview && nextGate ? (
            <ReviewGateControls
              jobId={jobId}
              attempt={attempt}
              gate={nextGate}
              predecessorReceiptId={predecessorReceiptId}
              evidenceDigest={evidenceDigest}
              irDigest={irDigest}
              runtimeDigest={runtimeDigest}
              releaseBaselineDigest={releaseBaselineDigest}
              artifactRefs={artifactRefs}
            />
          ) : null}
        </Panel>
      </div>
    </CreatorShell>
  );
}
