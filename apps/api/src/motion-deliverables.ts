import { createReadStream } from "node:fs";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { safeEnvelope } from "./boundary.js";
import type {
  CreatorWorkflowStore,
  StoredArtifact,
} from "./creator-workflow.js";
import { currentDeliveryGate } from "./motion-artifact-gate.js";
import {
  emitMotionEvent,
  sampleMotionMetric,
} from "../../../packages/contracts/src/motion-observability.js";

const body = (artifact: StoredArtifact) =>
  artifact.storagePath
    ? createReadStream(artifact.storagePath)
    : Buffer.from(artifact.bytes);

export function registerMotionDeliverables(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  db: Database.Database,
): void {
  const owned = (request: FastifyRequest<{ Params: { jobId: string } }>) => {
    const job = store.jobs.get(request.params.jobId);
    if (!job || job.tenantId !== request.headers["x-tenant-id"])
      throw new Error("RESOURCE_NOT_FOUND");
    return job;
  };
  app.get<{ Params: { jobId: string } }>(
    "/v1/jobs/:jobId/deliverables",
    async (request, reply) => {
      try {
        const job = owned(request);
        const gated = currentDeliveryGate(db, store, job);
        if (!gated) throw new Error("ARTIFACT_UNAVAILABLE");
        reply.send({
          backend: gated.backend,
          items: [
            {
              id: gated.delivery.id,
              kind: "mp4",
              downloadUrl: `/v1/jobs/${job.id}/delivery-download`,
            },
            ...(gated.backend === "native" && gated.scenePackage
              ? [
                  {
                    id: gated.scenePackage.id,
                    kind: "scene-package",
                    downloadUrl: `/v1/jobs/${job.id}/scene-package-download`,
                  },
                ]
              : []),
            ...(gated.backend === "adobe" && gated.delivery.report
              ? [
                  {
                    id: gated.delivery.id,
                    kind: "report",
                    downloadUrl: `/v1/jobs/${job.id}/report-download`,
                  },
                ]
              : []),
          ],
        });
      } catch (error) {
        reply
          .code(404)
          .send(
            safeEnvelope(error, String(reply.getHeader("x-correlation-id"))),
          );
      }
    },
  );
  app.get<{ Params: { jobId: string } }>(
    "/v1/jobs/:jobId/scene-package-download",
    async (request, reply) => {
      try {
        const job = owned(request);
        const gated = currentDeliveryGate(db, store, job);
        const artifact =
          gated?.backend === "native" ? gated.scenePackage : null;
        if (!artifact) throw new Error("ARTIFACT_UNAVAILABLE");
        sampleMotionMetric("package_downloads", 1, { jobId: job.id });
        emitMotionEvent(
          "package.hash",
          String(reply.getHeader("x-correlation-id")),
          { sha256: artifact.sha256, bytes: artifact.sizeBytes },
        );
        return reply
          .header("content-type", artifact.contentType)
          .header(
            "content-disposition",
            `attachment; filename="${artifact.filename}"`,
          )
          .send(body(artifact));
      } catch (error) {
        reply
          .code(404)
          .send(
            safeEnvelope(error, String(reply.getHeader("x-correlation-id"))),
          );
      }
    },
  );
}
