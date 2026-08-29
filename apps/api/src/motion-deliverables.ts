import { createReadStream } from "node:fs";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { safeEnvelope } from "./boundary.js";
import type {
  CreatorWorkflowStore,
  StoredArtifact,
} from "./creator-workflow.js";

const body = (artifact: StoredArtifact) =>
  artifact.storagePath
    ? createReadStream(artifact.storagePath)
    : Buffer.from(artifact.bytes);

export function registerMotionDeliverables(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
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
        const scenePackage = store.scenePackages.get(job.id);
        reply.send({
          backend: "native",
          items: [
            ...(job.artifact
              ? [
                  {
                    id: job.artifact.id,
                    kind: "mp4",
                    downloadUrl: `/v1/jobs/${job.id}/delivery-download`,
                  },
                ]
              : []),
            ...(scenePackage
              ? [
                  {
                    id: scenePackage.id,
                    kind: "scene-package",
                    downloadUrl: `/v1/jobs/${job.id}/scene-package-download`,
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
        const artifact = store.scenePackages.get(job.id);
        if (!artifact) throw new Error("ARTIFACT_UNAVAILABLE");
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
