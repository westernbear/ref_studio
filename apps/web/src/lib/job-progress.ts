export type BeatSheetEntry = Readonly<{
  beatId: string;
  shot: string;
  words: string;
}>;
export type JobProgress = {
  readonly id: string;
  readonly state: string;
  readonly preparationStage: string;
  readonly attempt: number;
  readonly updatedAt: string;
  readonly artifactId: string;
  readonly previewArtifactId: string;
  readonly previewLabeledArtifactId: string;
  readonly evidenceVideoArtifactId: string;
  readonly failureCode: string | null;
  readonly progressPhase: string;
  readonly progressStage: string;
  readonly progressFraction: number;
  readonly framesProcessed: number | null;
  readonly framesTotal: number | null;
  readonly approvedGates: readonly string[];
  // Set once the AI has authored a scene for this job -- scene authoring
  // runs in the API (not as a worker phase), so this shows up once that
  // finishes; null until then, and for restore-only jobs that never ask for
  // a generated scene at all.
  readonly beatSheet: readonly BeatSheetEntry[] | null;
};

// Display text for all of the below lives in messages/*.json under the
// "JobProgress" namespace -- these functions return translation keys (and
// ICU interpolation values where needed), never literal strings, so this
// file stays framework-agnostic and every caller localizes via useTranslations.

export const progressStages = [
  { state: "PREPARING", key: "preparing" },
  { state: "READY", key: "review" },
  { state: "QUEUED", key: "queued" },
  { state: "RENDERING", key: "rendering" },
  { state: "ASSEMBLING", key: "assembling" },
  { state: "AWAITING_T5", key: "finalCheck" },
  { state: "COMPLETED", key: "completed" },
] as const;

export const approvalGates = ["T1", "T2", "T3", "T4", "T5"] as const;
export type ApprovalGate = (typeof approvalGates)[number];

// Friendly display labels for the raw gate/decision identifiers stored on
// receipts -- keeps the wire values (matched against backend data) while
// hiding gate numbering and approval wording from the UI.
const GATE_LABEL_KEYS: Readonly<Record<ApprovalGate, string>> = {
  T1: "workerPreflight",
  T2: "evidenceVerified",
  T3: "sceneVerified",
  T4: "previewVerified",
  T5: "deliveryVerified",
};
export const gateLabelKey = (gate: string): string =>
  GATE_LABEL_KEYS[gate as ApprovalGate] ?? gate;
export const decisionKey = (decision: string): string =>
  decision === "APPROVED"
    ? "verified"
    : decision === "REJECTED"
      ? "failed"
      : "pending";

const terminalStates = ["COMPLETED", "CANCELLED", "FAILED"] as const;

const field = (value: unknown, key: string): unknown =>
  value !== null && typeof value === "object" ? Reflect.get(value, key) : "";

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

const numberValue = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const optionalNumber = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
const beatSheet = (value: unknown): readonly BeatSheetEntry[] | null => {
  if (!Array.isArray(value)) return null;
  const beats = value
    .filter((entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null,
    )
    .map((entry) => ({
      beatId: text(field(entry, "beatId")),
      shot: text(field(entry, "shot")),
      words: text(field(entry, "words")),
    }))
    .filter((entry) => entry.beatId);
  return beats.length ? beats : null;
};

export const parseJobProgress = (value: unknown): JobProgress | null => {
  const id = text(field(value, "id"));
  if (!id) return null;
  const artifact = field(value, "artifact");
  const progress = field(value, "progress");
  return {
    id,
    state: text(field(value, "state")) || "QUEUED",
    preparationStage: text(field(value, "preparationStage")),
    attempt: numberValue(field(value, "attempt")),
    updatedAt: text(field(value, "updatedAt")),
    artifactId: text(field(artifact, "id")),
    previewArtifactId: text(field(value, "previewArtifactId")),
    previewLabeledArtifactId: text(field(value, "previewLabeledArtifactId")),
    evidenceVideoArtifactId: text(field(value, "evidenceVideoArtifactId")),
    failureCode: text(field(value, "failureCode")) || null,
    progressPhase: text(field(progress, "phase")),
    progressStage: text(field(progress, "stage")),
    progressFraction: Math.min(
      1,
      Math.max(0, optionalNumber(field(progress, "fraction")) ?? 0),
    ),
    framesProcessed: optionalNumber(field(progress, "framesProcessed")),
    framesTotal: optionalNumber(field(progress, "framesTotal")),
    approvedGates: stringList(field(value, "approvedGates")),
    beatSheet: beatSheet(field(value, "beatSheet")),
  };
};

export const jobProgressPercent = (job: JobProgress): number =>
  (approvalGates.filter((gate) => job.approvedGates.includes(gate)).length /
    approvalGates.length) *
  100;

export const jobActivityPercent = (job: JobProgress): number =>
  job.progressFraction * 100;

export const isTerminalJobState = (state: string): boolean =>
  terminalStates.some((candidate) => candidate === state);

// States where a worker is actually running something. READY/AWAITING_T5 are
// not terminal -- the job lives on -- but nothing is being compiled, so the
// live stage checklist and its spinner must go quiet there instead of
// freezing on whichever stage happened to report last.
const workingStates = ["PREPARING", "RENDERING", "ASSEMBLING"] as const;
export const isJobWorking = (state: string): boolean =>
  workingStates.some((candidate) => candidate === state);

export const nextApprovalGate = (
  job: Pick<JobProgress, "state" | "preparationStage">,
): ApprovalGate | null => {
  if (job.state === "AWAITING_T5") return "T5";
  const byStage: Readonly<Record<string, ApprovalGate>> = {
    AWAITING_T2: "T2",
    AWAITING_T3: "T3",
    AWAITING_T4: "T4",
  };
  return byStage[job.preparationStage] ?? null;
};

const JOB_STATE_KEYS: Readonly<Record<string, string>> = {
  PREPARING: "preparing",
  READY: "ready",
  QUEUED: "queued",
  RENDERING: "rendering",
  ASSEMBLING: "assembling",
  AWAITING_T5: "awaitingT5",
  COMPLETED: "completed",
  CANCEL_REQUESTED: "cancelRequested",
  CANCELLED: "cancelled",
  RETRYABLE_ERROR: "retryableError",
  FAILED: "failed",
  STALE_APPROVAL: "staleApproval",
};
export const jobStateKey = (state: string): string =>
  JOB_STATE_KEYS[state] ?? state;

const PREPARATION_STAGE_KEYS: Readonly<Record<string, string>> = {
  AWAITING_T1: "awaitingT1",
  ANALYSIS_QUEUED: "analysisQueued",
  ANALYSIS_RUNNING: "analysisRunning",
  AWAITING_T2: "awaitingT2",
  COMPILATION_QUEUED: "compilationQueued",
  COMPILATION_RUNNING: "compilationRunning",
  AWAITING_T3: "awaitingT3",
  EVIDENCE_VIDEO_QUEUED: "evidenceVideoQueued",
  EVIDENCE_VIDEO_RUNNING: "evidenceVideoRunning",
  PREVIEW_QUEUED: "previewQueued",
  PREVIEW_RUNNING: "previewRunning",
  AWAITING_T4: "awaitingT4",
};

export type JobStatusMessage = Readonly<{
  key: string;
  values?: Readonly<Record<string, string>>;
}>;

export const jobStatusMessage = (job: JobProgress): JobStatusMessage => {
  const state = job.state;
  if (state === "COMPLETED") return { key: "completed" };
  if (state === "CANCELLED") return { key: "cancelled" };
  if (state === "FAILED")
    return job.failureCode === "CONTENT_SAFETY_REJECTED"
      ? { key: "failedSafety" }
      : { key: "failed" };
  if (state === "RETRYABLE_ERROR") return { key: "retryableError" };
  if (state === "STALE_APPROVAL") return { key: "staleApproval" };
  if (state === "RENDERING")
    return job.progressStage
      ? { key: "rendererActive", values: { stage: job.progressStage } }
      : { key: "rendererActiveDefault" };
  if (state === "PREPARING" || state === "STALE_APPROVAL") {
    if (job.progressStage)
      return { key: "compilerActive", values: { stage: job.progressStage } };
    const key = PREPARATION_STAGE_KEYS[job.preparationStage];
    return key ? { key } : { key: "preparingDefault" };
  }
  if (state === "READY") return { key: "readyForQueue" };
  if (state === "ASSEMBLING") return { key: "assembling" };
  if (state === "AWAITING_T5") return { key: "awaitingT5" };
  return { key: "waitingForUpdate" };
};

// Friendly display labels for the real compiler/worker stage strings reported
// via job.progress.stage (apps/worker/src/worker-job-handler.ts). Deliberately
// mapped from real data -- no invented pass names -- per the honest-mapping
// decision for the Compiler Dialogue screen.
const STAGE_LABEL_KEYS: Readonly<Record<string, string>> = {
  download: "download",
  ffprobe: "ffprobe",
  normalize: "normalize",
  preflight: "preflight",
  models: "models",
  "all-frame-analysis": "allFrameAnalysis",
  "audio-and-mapping": "audioAndMapping",
  evidence: "evidence",
  "scene-compile": "sceneCompile",
  "scene-render": "sceneRender",
  upload: "upload",
};
const titleCase = (value: string): string =>
  value
    .replace(/[-_]/gu, " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());

// Returns a StageLabels.* translation key for known stages, or the raw
// title-cased stage string as a last-resort fallback for stages the worker
// might report that this UI hasn't been told about yet.
export const stageLabelKey = (
  stage: string,
): Readonly<{ known: true; key: string } | { known: false; fallback: string }> => {
  const key = STAGE_LABEL_KEYS[stage];
  if (key) return { known: true, key };
  return { known: false, fallback: stage ? titleCase(stage) : "" };
};

// What the person looking at this screen should do now. Every other thing on
// the review screen reports state -- a chip, a stage log, a table of checks --
// and none of it says whose turn it is, so the moment the compiler went quiet
// there was nothing to read as "your move". Returns a NextStep.* key.
export const nextStepKey = (job: JobProgress): string => {
  if (job.state === "COMPLETED") return "collectDelivery";
  if (job.state === "FAILED") return "startOver";
  if (job.state === "CANCELLED") return "startOver";
  if (job.state === "RETRYABLE_ERROR") return "retrying";
  if (job.state === "STALE_APPROVAL") return "reviewAgain";
  if (job.state === "AWAITING_T5") return "finalCheckRunning";
  if (job.state === "QUEUED" || job.state === "RENDERING" || job.state === "ASSEMBLING")
    return "buildingFinal";
  if (job.state === "READY")
    return job.approvedGates.includes("T4") ? "readyToRender" : "verifying";
  return "building";
};

// Which of the accumulated chat messages is the stage currently being worked
// on. It is the last stage recorded, not every message that happens to name
// the same stage: a job that comes back to a stage it has already been through
// -- a retry, or a stage belonging to more than one phase -- records it twice,
// and matching on the name alone put a spinner on both. Returns -1 when
// nothing is running, which includes the moment after a retry clears progress.
export const runningStageIndex = (
  roles: readonly string[],
  progressStage: string,
): number =>
  progressStage
    ? roles.reduce(
        (found, role, index) => (role === "stage" ? index : found),
        -1,
      )
    : -1;

export const normalizeStage = (stage: string): string =>
  stage.replace(/^compiler:/u, "").replace("preview-upload", "upload");

// The SceneSpec schema's five shot names (packages/contracts/src/scene-spec.ts)
// are a closed set, but this is display code reading data an AI produced --
// same known/fallback shape as stageLabelKey, so an unrecognized value still
// renders something readable instead of a raw enum string.
const SHOT_LABEL_KEYS: Readonly<Record<string, string>> = {
  "push-in": "pushIn",
  "hard-cut": "hardCut",
  "ring-expand": "ringExpand",
  "tile-grid": "tileGrid",
  "type-flash": "typeFlash",
};
export const shotLabelKey = (
  shot: string,
): Readonly<{ known: true; key: string } | { known: false; fallback: string }> => {
  const key = SHOT_LABEL_KEYS[shot];
  if (key) return { known: true, key };
  return { known: false, fallback: shot ? titleCase(shot) : "" };
};

export const liveJobStatusErrorCode = (value: unknown, status: number): string =>
  text(field(field(value, "error"), "code")) || `HTTP_${status}`;

export const formatJobStamp = (value: string): string | null =>
  value ? (value.includes("T") ? value.replace("T", " ").slice(0, 19) : value) : null;
