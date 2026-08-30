import { redactSensitive, type RedactedValue } from "./redact.js";

export const MotionObservabilityEvents = [
  "lookup.query_class",
  "canary.status",
  "plan.digest",
  "operations.count",
  "verification.attempt",
  "capability.mismatch",
  "render.duration_memory",
  "package.hash",
  "adobe.command_lifecycle",
  "adobe.replay_reject",
  "user.action_result",
] as const;

export type MotionObservabilityEvent =
  (typeof MotionObservabilityEvents)[number];

export type MotionMetric =
  | "tthw_ms"
  | "lookup_recall"
  | "four_attempt_failures"
  | "stale_conflicts"
  | "render_determinism"
  | "package_downloads"
  | "adobe_queue_age_ms"
  | "rollback_frequency";

export type MotionObservabilityRecord = Readonly<{
  event: MotionObservabilityEvent;
  correlationId: string;
  at: string;
  fields: RedactedValue;
}>;

export type MotionMetricSample = Readonly<{
  metric: MotionMetric;
  value: number;
  at: string;
  labels: RedactedValue;
}>;

type Sink = {
  emit(record: MotionObservabilityRecord): void;
  sample(metric: MotionMetricSample): void;
};

const memoryEvents: MotionObservabilityRecord[] = [];
const memoryMetrics: MotionMetricSample[] = [];

const defaultSink: Sink = {
  emit(record) {
    memoryEvents.push(record);
  },
  sample(metric) {
    memoryMetrics.push(metric);
  },
};

let sink: Sink = defaultSink;

export const setMotionObservabilitySink = (next: Sink | null): void => {
  sink = next ?? defaultSink;
};

export const resetMotionObservability = (): void => {
  memoryEvents.length = 0;
  memoryMetrics.length = 0;
  sink = defaultSink;
};

export const motionObservabilitySnapshot = (): Readonly<{
  events: readonly MotionObservabilityRecord[];
  metrics: readonly MotionMetricSample[];
}> => ({ events: [...memoryEvents], metrics: [...memoryMetrics] });

export const emitMotionEvent = (
  event: MotionObservabilityEvent,
  correlationId: string,
  fields: Record<string, unknown>,
  at = new Date().toISOString(),
): void => {
  sink.emit({
    event,
    correlationId,
    at,
    fields: redactSensitive(fields),
  });
};

export const sampleMotionMetric = (
  metric: MotionMetric,
  value: number,
  labels: Record<string, unknown> = {},
  at = new Date().toISOString(),
): void => {
  sink.sample({
    metric,
    value,
    at,
    labels: redactSensitive(labels),
  });
};
