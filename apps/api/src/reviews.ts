import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { safeEnvelope } from "./boundary.js";

export const GATE_DAG = {
  T1: null,
  T2: "T1",
  T3: "T2",
  T4: "T3",
  T5: "T4",
} as const;
export type Gate = keyof typeof GATE_DAG;
export type ReviewDecision = "APPROVED" | "REJECTED";
export type ReviewReceipt = Readonly<{
  id: string;
  releaseId: string | null;
  jobId: string | null;
  tenantId: string | null;
  attempt: number;
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

// Gate progression is fully automatic (see autoApproveT1/T2T3/T4/T5 in
// creator-workflow.ts) — there is no human Approve/Reject decision left to
// take over HTTP, so this module only exposes the read-only receipt history.
export function registerReviews(
  app: FastifyInstance,
  reviewStore: ReviewStore,
): void {
  app.get(
    "/v1/receipts",
    async (
      request: FastifyRequest<{
        Querystring: {
          jobId?: string;
          gate?: string;
          after?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const limit = Number(request.query.limit ?? 50);
      const after = Number(request.query.after ?? 0);
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100 ||
        !Number.isInteger(after) ||
        after < 0 ||
        (request.query.gate !== undefined && !(request.query.gate in GATE_DAG))
      ) {
        reply
          .code(400)
          .send(
            safeEnvelope(
              new Error("INVALID_REQUEST"),
              String(reply.getHeader("x-correlation-id")),
            ),
          );
        return;
      }
      const tenantId =
        typeof request.headers["x-tenant-id"] === "string"
          ? request.headers["x-tenant-id"]
          : "";
      const matching = reviewStore.receipts.filter(
        (receipt) =>
          receipt.tenantId === tenantId &&
          (!request.query.jobId || receipt.jobId === request.query.jobId) &&
          (!request.query.gate || receipt.gate === request.query.gate),
      );
      const selected = matching.slice(after, after + limit);
      reply.send({
        items: selected,
        pageInfo: {
          hasNextPage: after + selected.length < matching.length,
          hasPreviousPage: after > 0,
        },
      });
    },
  );
}
