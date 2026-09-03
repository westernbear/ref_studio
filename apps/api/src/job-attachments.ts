import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type Database from "better-sqlite3";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { requestHeader } from "./admin-auth.js";
import { safeEnvelope } from "./boundary.js";
import type { CreatorWorkflowStore } from "./creator-workflow.js";
import { sanitizeFilename } from "./uploads.js";

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_JOB = 10;

const id = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString("base64url")}`;
const fail = (reply: FastifyReply, code: string, status = 400): void => {
  reply
    .code(status)
    .send(
      safeEnvelope(
        new Error(code),
        String(reply.getHeader("x-correlation-id")),
      ),
    );
};

export function registerJobAttachments(
  app: FastifyInstance,
  store: CreatorWorkflowStore,
  db: Database.Database,
  attachmentsRoot: string,
): void {
  const tenant = (request: FastifyRequest): string =>
    requestHeader(request, "x-tenant-id") ?? "";

  app.post(
    "/v1/jobs/:jobId/attachments",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = store.jobs.get(request.params.jobId);
        if (!job || job.tenantId !== tenant(request))
          throw new Error("RESOURCE_NOT_FOUND");
        const existingCount = (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM job_attachments WHERE job_id = ?",
            )
            .get(job.id) as { count: number }
        ).count;
        if (existingCount >= MAX_ATTACHMENTS_PER_JOB)
          throw new Error("QUOTA_EXCEEDED");
        const body = request.body;
        const bytes =
          body instanceof Uint8Array
            ? body
            : typeof body === "string"
              ? Buffer.from(body)
              : (() => {
                  throw new Error("INVALID_REQUEST");
                })();
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES)
          throw new Error("VIDEO_SIZE_LIMIT_EXCEEDED");
        const rawFilename = requestHeader(request, "x-filename");
        const decodedFilename = (() => {
          if (!rawFilename) return "attachment";
          try {
            return decodeURIComponent(rawFilename);
          } catch {
            return rawFilename;
          }
        })();
        const filename = sanitizeFilename(decodedFilename);
        const contentType =
          requestHeader(request, "content-type") ?? "application/octet-stream";
        const attachmentId = id("attach");
        const directory = join(attachmentsRoot, job.tenantId);
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        const storagePath = join(directory, attachmentId);
        writeFileSync(storagePath, bytes, { mode: 0o600 });
        const createdAt = new Date(store.now()).toISOString();
        db.prepare(
          `INSERT INTO job_attachments
             (id, job_id, tenant_id, filename, content_type, size_bytes, storage_path, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          attachmentId,
          job.id,
          job.tenantId,
          filename,
          contentType,
          bytes.byteLength,
          storagePath,
          createdAt,
        );
        reply.code(201).send({
          id: attachmentId,
          filename,
          contentType,
          sizeBytes: bytes.byteLength,
          createdAt,
        });
      } catch (error) {
        const code = error instanceof Error ? error.message : "INTERNAL_ERROR";
        fail(
          reply,
          code,
          code === "RESOURCE_NOT_FOUND"
            ? 404
            : code === "QUOTA_EXCEEDED"
              ? 403
              : 400,
        );
      }
    },
  );

  app.get(
    "/v1/jobs/:jobId/attachments",
    async (request: FastifyRequest<{ Params: { jobId: string } }>, reply) => {
      try {
        const job = store.jobs.get(request.params.jobId);
        if (!job || job.tenantId !== tenant(request))
          throw new Error("RESOURCE_NOT_FOUND");
        const rows = db
          .prepare(
            `SELECT id, filename, content_type AS contentType, size_bytes AS sizeBytes, created_at AS createdAt
               FROM job_attachments WHERE job_id = ? ORDER BY created_at`,
          )
          .all(job.id);
        reply.send({ items: rows });
      } catch (error) {
        fail(
          reply,
          error instanceof Error ? error.message : "INTERNAL_ERROR",
          404,
        );
      }
    },
  );
}
