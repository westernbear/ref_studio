import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  authenticateBearer,
  authenticateReleaseBearer,
  authorizeReleaseReview,
  type Assignment,
  type AuthStore,
  type Principal,
} from "./auth.js";
import { safeEnvelope } from "./boundary.js";
import type { CreatorWorkflowStore, Job } from "./creator-workflow.js";

export const GATE_DAG = {
  T1: null,
  T2: "T1",
  T3: "T2",
  T4: "T3",
  T5: "T4",
  T6: "T5",
} as const;
export type Gate = keyof typeof GATE_DAG;
export type ReviewDecision = "APPROVED" | "REJECTED";
export type ReviewReceipt = Readonly<{
  id: string;
  jobId: string | null;
  tenantId: string | null;
  gate: Gate;
  decision: ReviewDecision;
  actorId: string;
  predecessorReceiptId: string | null;
  evidenceDigest: string;
  irDigest: string;
  runtimeDigest: string;
  releaseBaselineDigest: string;
  reason: string;
  artifactRefs: readonly string[];
  correctionOf: string | null;
  sequence: number;
  createdAt: string;
}>;
export type ReviewStore = {
  readonly receipts: ReviewReceipt[];
  readonly current: Map<
    string,
    {
      evidenceDigest: string;
      irDigest: string;
      runtimeDigest: string;
      releaseBaselineDigest: string;
    }
  >;
  readonly sequence: { value: number };
};
export const createReviewStore = (): ReviewStore => ({
  receipts: [],
  current: new Map(),
  sequence: { value: 0 },
});
type Body = {
  jobId?: string;
  attempt?: number;
  gate?: string;
  decision?: ReviewDecision;
  predecessorReceiptId?: string | null;
  evidenceDigest?: string;
  irDigest?: string;
  runtimeDigest?: string;
  releaseBaselineDigest?: string;
  reason?: string;
  artifactRefs?: string[];
  correctionOf?: string | null;
};
const id = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString("base64url")}`;
const error = (reply: FastifyReply, code: string): void => {
  reply
    .code(
      code === "ROLE_NOT_PERMITTED" || code === "TENANT_HEADER_FORBIDDEN"
        ? 403
        : code === "AUTHENTICATION_REQUIRED"
          ? 401
          : code === "RESOURCE_NOT_FOUND"
            ? 404
            : 409,
    )
    .send(
      safeEnvelope(
        new Error(code),
        String(reply.getHeader("x-correlation-id")),
      ),
    );
};
const auth = (
  request: FastifyRequest,
  store: AuthStore,
  release: boolean,
  now: number,
): Principal | null => {
  const value = request.headers.authorization;
  const raw =
    typeof value === "string" && value.startsWith("Bearer ")
      ? value.slice(7)
      : "";
  const principal = release
    ? authenticateReleaseBearer(store, raw, now)
    : authenticateBearer(
        store,
        raw,
        typeof request.headers["x-tenant-id"] === "string"
          ? request.headers["x-tenant-id"]
          : undefined,
        now,
      );
  return "code" in principal ? null : principal;
};
const assignment = (
  store: AuthStore,
  principal: Principal,
  gate: Gate,
  tenantId: string | null,
  scope: Assignment["scope"],
): boolean =>
  store.assignments.some(
    (item) =>
      item.reviewerId === principal.userId &&
      item.gate === gate &&
      item.scope === scope &&
      item.tenantId === tenantId,
  );
const required = (
  body: Body,
  release: boolean,
): body is Required<
  Pick<
    Body,
    | "attempt"
    | "gate"
    | "decision"
    | "evidenceDigest"
    | "irDigest"
    | "runtimeDigest"
    | "releaseBaselineDigest"
    | "reason"
    | "artifactRefs"
  >
> &
  Pick<Body, "jobId" | "predecessorReceiptId" | "correctionOf"> =>
  (release || typeof body.jobId === "string") &&
  Number.isInteger(body.attempt) &&
  typeof body.gate === "string" &&
  body.gate in GATE_DAG &&
  (body.decision === "APPROVED" || body.decision === "REJECTED") &&
  [
    body.evidenceDigest,
    body.irDigest,
    body.runtimeDigest,
    body.releaseBaselineDigest,
    body.reason,
  ].every((value) => typeof value === "string" && value.length > 0) &&
  Array.isArray(body.artifactRefs);
const receiptFor = (
  store: ReviewStore,
  jobId: string | null,
  gate: Gate,
  decision: ReviewDecision,
): ReviewReceipt | undefined =>
  [...store.receipts]
    .reverse()
    .find(
      (item) =>
        item.jobId === jobId &&
        item.gate === gate &&
        item.decision === decision,
    );
function decide(
  store: ReviewStore,
  authStore: AuthStore,
  workflow: CreatorWorkflowStore | undefined,
  principal: Principal,
  body: Body,
  release: boolean,
  now: number,
): ReviewReceipt {
  if (!required(body, release)) throw new Error("INVALID_REQUEST");
  const gate = body.gate as Gate;
  const job: Job | undefined = body.jobId
    ? workflow?.jobs.get(body.jobId)
    : undefined;
  const tenantId = release ? null : (job?.tenantId ?? null);
  if (!release && (!job || job.tenantId !== principal.tenantId))
    throw new Error("RESOURCE_NOT_FOUND");
  if (release && authorizeReleaseReview(authStore, principal, undefined))
    throw new Error("ROLE_NOT_PERMITTED");
  if (
    !assignment(
      authStore,
      principal,
      gate,
      tenantId,
      release ? "RELEASE" : "TENANT",
    )
  )
    throw new Error("ROLE_NOT_PERMITTED");
  if (release && gate !== "T6") throw new Error("ROLE_NOT_PERMITTED");
  const predecessor = GATE_DAG[gate];
  const previous = predecessor
    ? release
      ? (receiptFor(store, null, predecessor, "APPROVED") ??
        [...store.receipts]
          .reverse()
          .find(
            (item) => item.gate === predecessor && item.decision === "APPROVED",
          ))
      : receiptFor(store, body.jobId ?? null, predecessor, "APPROVED")
    : undefined;
  if (predecessor && (!previous || body.predecessorReceiptId !== previous.id))
    throw new Error("INVALID_REQUEST");
  const key = `${body.jobId ?? "release"}:${gate}:${body.attempt}`;
  const current = store.current.get(key);
  const snapshot = {
    evidenceDigest: body.evidenceDigest,
    irDigest: body.irDigest,
    runtimeDigest: body.runtimeDigest,
    releaseBaselineDigest: body.releaseBaselineDigest,
  };
  if (current && JSON.stringify(current) !== JSON.stringify(snapshot)) {
    if (job && job.state !== "STALE_APPROVAL") job.state = "STALE_APPROVAL";
    throw new Error("STALE_APPROVAL_UNSAFE");
  }
  store.current.set(key, snapshot);
  if (receiptFor(store, body.jobId ?? null, gate, body.decision))
    throw new Error("INVALID_REQUEST");
  const receipt: ReviewReceipt = {
    id: id("rcpt"),
    jobId: body.jobId ?? null,
    tenantId,
    gate,
    decision: body.decision,
    actorId: principal.userId,
    predecessorReceiptId: body.predecessorReceiptId ?? null,
    ...snapshot,
    reason: body.reason,
    artifactRefs: [...body.artifactRefs],
    correctionOf: body.correctionOf ?? null,
    sequence: ++store.sequence.value,
    createdAt: new Date(now).toISOString(),
  };
  store.receipts.push(receipt);
  if (job && gate === "T5" && body.decision === "APPROVED") job.approved = true;
  return receipt;
}
export function registerReviews(
  app: FastifyInstance,
  authStore: AuthStore,
  reviewStore: ReviewStore,
  workflow: CreatorWorkflowStore | undefined,
  now: () => number,
): void {
  const route = async (
    request: FastifyRequest<{ Body: Body }>,
    reply: FastifyReply,
    release: boolean,
  ): Promise<void> => {
    if (release && typeof request.headers["x-tenant-id"] === "string") {
      error(reply, "TENANT_HEADER_FORBIDDEN");
      return;
    }
    const principal = auth(request, authStore, release, now());
    if (!principal) {
      error(reply, "AUTHENTICATION_REQUIRED");
      return;
    }
    try {
      const receipt = decide(
        reviewStore,
        authStore,
        workflow,
        principal,
        request.body,
        release,
        now(),
      );
      reply.code(201).send({
        review: {
          id: receipt.id,
          tenantId: receipt.tenantId,
          jobId: receipt.jobId,
          gate: receipt.gate,
          decision: receipt.decision,
          actorId: receipt.actorId,
          createdAt: receipt.createdAt,
        },
        receipt,
      });
    } catch (cause) {
      error(reply, cause instanceof Error ? cause.message : "INTERNAL_ERROR");
    }
  };
  app.post<{ Body: Body }>("/v1/reviews", (request, reply) =>
    route(request, reply, false),
  );
  app.post<{ Body: Body }>("/v1/release-reviews", (request, reply) =>
    route(request, reply, true),
  );
}
