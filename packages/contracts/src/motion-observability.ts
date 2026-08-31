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

const MEMORY_CAP = 256;

const retain = <T>(buffer: T[], item: T): void => {
  buffer.push(item);
  if (buffer.length > MEMORY_CAP) buffer.splice(0, buffer.length - MEMORY_CAP);
};

const defaultSink: Sink = {
  emit(record) {
    retain(memoryEvents, record);
  },
  sample(metric) {
    retain(memoryMetrics, metric);
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

export const MOTION_OBSERVABILITY_DASHBOARD = {
  schema: "motion-observability-dashboard-v1",
  panels: [
    {
      metric: "tthw_ms",
      kind: "histogram",
      title: "Time to first authored scene",
    },
    {
      metric: "lookup_recall",
      kind: "counter",
      title: "Knowledge lookup hits",
    },
    {
      metric: "four_attempt_failures",
      kind: "counter",
      title: "Four-attempt failures",
    },
    {
      metric: "stale_conflicts",
      kind: "counter",
      title: "Stale ETag conflicts",
    },
    {
      metric: "render_determinism",
      kind: "counter",
      title: "Deterministic render matches",
    },
    {
      metric: "package_downloads",
      kind: "counter",
      title: "Scene package downloads",
    },
    {
      metric: "adobe_queue_age_ms",
      kind: "histogram",
      title: "Adobe command queue age",
    },
    { metric: "rollback_frequency", kind: "counter", title: "Scene rollbacks" },
  ],
} as const;

const HISTOGRAM_METRICS = new Set<MotionMetric>([
  "tthw_ms",
  "adobe_queue_age_ms",
]);

const percentile = (values: readonly number[], q: number): number => {
  if (values.length === 0) return 0;
  const ranked = [...values].sort((left, right) => left - right);
  const index = Math.min(
    ranked.length - 1,
    Math.max(0, Math.ceil(q * ranked.length) - 1),
  );
  return ranked[index] ?? 0;
};

export type MotionHistogram = Readonly<{
  metric: MotionMetric;
  kind: "histogram";
  count: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
}>;

export const motionObservabilityHistograms = (): readonly MotionHistogram[] => {
  const byMetric = new Map<MotionMetric, number[]>();
  for (const sample of memoryMetrics) {
    if (!HISTOGRAM_METRICS.has(sample.metric)) continue;
    const values = byMetric.get(sample.metric) ?? [];
    values.push(sample.value);
    byMetric.set(sample.metric, values);
  }
  return [...byMetric.entries()].map(([metric, values]) => ({
    metric,
    kind: "histogram",
    count: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  }));
};

export const motionObservabilitySnapshot = (): Readonly<{
  events: readonly MotionObservabilityRecord[];
  metrics: readonly MotionMetricSample[];
  histograms: readonly MotionHistogram[];
}> => ({
  events: [...memoryEvents],
  metrics: [...memoryMetrics],
  histograms: motionObservabilityHistograms(),
});

export const emitMotionEvent = (
  event: MotionObservabilityEvent,
  correlationId: string,
  fields: Record<string, unknown>,
  at = new Date().toISOString(),
): void => {
  const record = {
    event,
    correlationId,
    at,
    fields: redactSensitive(fields),
  };
  retain(memoryEvents, record);
  if (sink !== defaultSink) sink.emit(record);
};

export const sampleMotionMetric = (
  metric: MotionMetric,
  value: number,
  labels: Record<string, unknown> = {},
  at = new Date().toISOString(),
): void => {
  const sample = {
    metric,
    value,
    at,
    labels: redactSensitive(labels),
  };
  retain(memoryMetrics, sample);
  if (sink !== defaultSink) sink.sample(sample);
};
