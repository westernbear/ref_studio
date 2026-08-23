export type JobProgress = {
  readonly id: string;
  readonly state: string;
  readonly attempt: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly artifactId: string;
};

export const progressStages = [
  {
    state: "QUEUED",
    label: "Queued",
    description: "Waiting for compiler capacity.",
  },
  {
    state: "PREPARING",
    label: "Preparing",
    description: "Validating source and building inputs.",
  },
  {
    state: "RENDERING",
    label: "Rendering",
    description: "Compiler work is active.",
  },
  {
    state: "COMPLETED",
    label: "Completed",
    description: "Output is ready for review.",
  },
] as const;

const percentByState: Record<string, number> = {
  PREPARING: 35,
  READY: 45,
  QUEUED: 12,
  RENDERING: 72,
  ASSEMBLING: 88,
  AWAITING_T5: 94,
  COMPLETED: 100,
  STALE_APPROVAL: 100,
  CANCEL_REQUESTED: 86,
  CANCELLED: 100,
  RETRYABLE_ERROR: 100,
  FAILED: 100,
};

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

export const parseJobProgress = (value: unknown): JobProgress | null => {
  const id = text(field(value, "id"));
  if (!id) return null;
  const artifact = field(value, "artifact");
  return {
    id,
    state: text(field(value, "state")) || "QUEUED",
    attempt: numberValue(field(value, "attempt")),
    createdAt: text(field(value, "createdAt")),
    updatedAt: text(field(value, "updatedAt")),
    artifactId: text(field(artifact, "id")),
  };
};

export const jobProgressPercent = (state: string): number =>
  percentByState[state] ?? 12;

export const isTerminalJobState = (state: string): boolean =>
  terminalStates.some((candidate) => candidate === state);

export const jobStatusCopy = (state: string): string => {
  if (state === "COMPLETED") return "Compiler job completed.";
  if (state === "CANCELLED") return "Compiler job was cancelled.";
  if (state === "FAILED") return "Compiler job failed.";
  if (state === "RETRYABLE_ERROR") return "Compiler job needs retry.";
  if (state === "STALE_APPROVAL") return "Approval is stale.";
  if (state === "RENDERING") return "Reference compiler active.";
  if (state === "PREPARING") return "Preparing compiler inputs.";
  if (state === "READY") return "Ready for queue admission.";
  if (state === "ASSEMBLING") return "Assembling compiler output.";
  if (state === "AWAITING_T5") return "Awaiting final delivery gate.";
  return "Waiting for worker update.";
};

export const formatJobStamp = (value: string): string =>
  value.includes("T")
    ? value.replace("T", " ").slice(0, 19)
    : value || "Not set";
