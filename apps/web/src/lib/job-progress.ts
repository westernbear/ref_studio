export type JobProgress = {
  readonly id: string;
  readonly state: string;
  readonly attempt: number;
  readonly updatedAt: string;
  readonly artifactId: string;
  readonly progressPhase: string;
  readonly progressStage: string;
  readonly progressFraction: number;
  readonly framesProcessed: number | null;
  readonly framesTotal: number | null;
  readonly approvedGates: readonly string[];
};

export const progressStages = [
  {
    state: "PREPARING",
    label: "Preparing",
    description: "Validating source and building inputs.",
  },
  {
    state: "READY",
    label: "Review",
    description: "Prepared output is ready for approval.",
  },
  {
    state: "QUEUED",
    label: "Queued",
    description: "Waiting for renderer capacity.",
  },
  {
    state: "RENDERING",
    label: "Rendering",
    description: "Compiler work is active.",
  },
  {
    state: "ASSEMBLING",
    label: "Assembling",
    description: "Encoding and delivery checks are active.",
  },
  {
    state: "AWAITING_T5",
    label: "Final review",
    description: "The exact final shot is awaiting T5.",
  },
  {
    state: "COMPLETED",
    label: "Completed",
    description: "Output is ready for review.",
  },
] as const;

export const approvalGates = ["T1", "T2", "T3", "T4", "T5", "T6"] as const;

const terminalStates = [
  "COMPLETED",
  "CANCELLED",
  "FAILED",
  "RETRYABLE_ERROR",
  "STALE_APPROVAL",
] as const;

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

export const parseJobProgress = (value: unknown): JobProgress | null => {
  const id = text(field(value, "id"));
  if (!id) return null;
  const artifact = field(value, "artifact");
  const progress = field(value, "progress");
  return {
    id,
    state: text(field(value, "state")) || "QUEUED",
    attempt: numberValue(field(value, "attempt")),
    updatedAt: text(field(value, "updatedAt")),
    artifactId: text(field(artifact, "id")),
    progressPhase: text(field(progress, "phase")),
    progressStage: text(field(progress, "stage")),
    progressFraction: Math.min(
      1,
      Math.max(0, optionalNumber(field(progress, "fraction")) ?? 0),
    ),
    framesProcessed: optionalNumber(field(progress, "framesProcessed")),
    framesTotal: optionalNumber(field(progress, "framesTotal")),
    approvedGates: stringList(field(value, "approvedGates")),
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

export const jobStatusCopy = (job: JobProgress): string => {
  const state = job.state;
  if (state === "COMPLETED") return "Compiler job completed.";
  if (state === "CANCELLED") return "Compiler job was cancelled.";
  if (state === "FAILED") return "Compiler job failed.";
  if (state === "RETRYABLE_ERROR") return "Compiler job needs retry.";
  if (state === "STALE_APPROVAL") return "Approval is stale.";
  if (state === "RENDERING")
    return job.progressStage
      ? `Renderer active: ${job.progressStage}.`
      : "Reference renderer active.";
  if (state === "PREPARING")
    return job.progressStage
      ? `Compiler active: ${job.progressStage}.`
      : "Preparing compiler inputs.";
  if (state === "READY") return "Ready for queue admission.";
  if (state === "ASSEMBLING") return "Assembling compiler output.";
  if (state === "AWAITING_T5") return "Awaiting final delivery gate.";
  return "Waiting for worker update.";
};

export const liveJobStatusError = (value: unknown, status: number): string => {
  const code = text(field(field(value, "error"), "code")) || `HTTP_${status}`;
  return `Live job status is unavailable: ${code}.`;
};

export const formatJobStamp = (value: string): string =>
  value.includes("T")
    ? value.replace("T", " ").slice(0, 19)
    : value || "Not set";
