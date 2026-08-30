import { Readable } from "node:stream";
import type Database from "better-sqlite3";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import {
  authenticateBearer,
  authenticateSession,
  clearSessionCookie,
  hashBearer,
  revokeSession,
  rotateSessionTenant,
  sessionCookie,
  ABSOLUTE_SESSION_MS,
  signIn,
  type AuthStore,
  type AuthFailure,
  type Principal,
} from "./auth.js";
import {
  correlationId,
  fenceResource,
  IdempotencyStore,
  type PersistenceRequest,
  recordDenied,
  requestPersistence,
  requestHash,
  safeEnvelope,
} from "./boundary.js";
import { decodeCookieValue } from "./admin-auth.js";
import {
  abortUpload,
  cleanupExpiredUploads,
  createAttachment,
  createUpload,
  FinalizeUploadSchema,
  getUpload,
  MAX_ATTACHMENT_BYTES,
  MAX_CHUNK_BYTES,
  putChunk,
  UploadFailure,
  validateAndFinalizeUpload,
  type UploadMedia,
  type UploadRecord,
  type UploadStore,
} from "./uploads.js";
import {
  registerCreatorWorkflow,
  type CreatorWorkflowStore,
} from "./creator-workflow.js";
import { registerAdminRead, type AdminReadStore } from "./admin-read.js";
import {
  registerAdminMutation,
  type AdminMutationStore,
} from "./admin-mutation.js";
import { registerJobAttachments } from "./job-attachments.js";
import { registerMotionScene } from "./motion-scene.js";
import { registerRefinePrompt } from "./refine-prompt.js";
import {
  freezeFeatureFlagSnapshot,
  loadFeatureFlagSnapshot,
  type FeatureFlagSnapshot,
} from "./feature-flags.js";
import type { GenerateScene } from "./author-scene.js";
import type { GenerateMotionPlanCandidate } from "./motion-plan-generator.js";
import type { GeneratePatch } from "./patch-scene.js";
import type { GenerateImage } from "./openai-image-material.js";
import type { GenerateSafetyVerdict } from "./safety-check.js";
import type { GenerateTranslation } from "./translate-evidence.js";
import { registerReviews, type ReviewStore } from "./reviews.js";
import {
  advanceDeletionEpoch,
  cleanupRetention,
  type RetentionStore,
} from "./retention.js";
import {
  fenceTenantJobs,
  registerWorkers,
  type WorkerStore,
} from "./workers.js";
import { registerAdobeMcpRoutes } from "./adobe-mcp-routes.js";

type WorkerAppOptions =
  | { readonly workers?: undefined; readonly artifactRoot?: undefined }
  | { readonly workers: WorkerStore; readonly artifactRoot: string };

export type AppOptions = {
  readonly store: AuthStore;
  readonly expectedOrigin: string;
  readonly introspectSecret: string;
  readonly now?: () => number;
  readonly idempotency?: IdempotencyStore;
  readonly onTenantAction?: () => Record<string, unknown>;
  readonly uploads?: UploadStore;
  readonly validateUpload?: (
    upload: UploadRecord,
    sourceSha256: string,
  ) => Promise<UploadMedia>;
  readonly creatorWorkflow?: CreatorWorkflowStore;
  readonly adminReads?: AdminReadStore;
  readonly adminMutations?: AdminMutationStore;
  readonly reviews?: ReviewStore;
  readonly retention?: RetentionStore;
  readonly persist?: () => void;
  readonly adminSessionTimeoutMs?: number;
  readonly db?: Database.Database;
  readonly aiSecretKey?: string;
  readonly attachmentsRoot?: string;
  readonly refinePromptGenerate?: Parameters<typeof registerRefinePrompt>[5];
  readonly patchSceneGenerate?: GeneratePatch;
  readonly safetyCheckGenerate?: GenerateSafetyVerdict;
  readonly translateGenerate?: GenerateTranslation;
  readonly authorSceneGenerate?: GenerateScene;
  readonly authorSceneGeneratePlan?: GenerateMotionPlanCandidate;
  readonly materialGenerate?: GenerateImage;
  readonly featureFlags?: FeatureFlagSnapshot;
} & WorkerAppOptions;
const header = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === "string" ? value : undefined;
};
const cookie = (request: FastifyRequest, name: string): string | undefined =>
  header(request, "cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
// I1: the video/mp4|quicktime|webm content-type parsers hand the body over
// as a raw, unbuffered Readable (see their registration above -- kept that
// way so large worker artifact uploads can stream to disk instead of
// loading into memory). POST /v1/attachments needs the whole body as bytes
// to sniff and store, so it buffers a Readable itself here rather than
// changing those parsers for every route that shares them. Bounded by the
// same limit as this route's own `bodyLimit` option, as a second guard.
const bufferReadable = (
  stream: Readable,
  limitBytes: number,
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > limitBytes) {
        stream.destroy();
        reject(new UploadFailure("ATTACHMENT_SIZE_LIMIT_EXCEEDED"));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", () => reject(new UploadFailure("INVALID_REQUEST")));
  });
const failure = (
  reply: FastifyReply,
  result:
    | AuthFailure
    | UploadFailure
    | {
        readonly code:
          | "TENANT_BOUNDARY_BYPASS"
          | "RESOURCE_NOT_FOUND"
          | "DELETION_EPOCH_STALE"
          | "ROLE_NOT_PERMITTED";
      },
): FastifyReply => {
  const correlation = reply.getHeader("x-correlation-id");
  const id = typeof correlation === "string" ? correlation : correlationId();
  const status =
    result.code === "AUTHENTICATION_REQUIRED"
      ? 401
      : result.code === "RESOURCE_NOT_FOUND"
        ? 404
        : result.code === "UPLOAD_EXPIRED"
          ? 410
          : result.code === "ATTACHMENT_TYPE_INVALID" ||
              result.code === "ATTACHMENT_SIZE_LIMIT_EXCEEDED" ||
              result.code === "ATTACHMENT_COUNT_LIMIT_EXCEEDED" ||
              result.code === "ATTACHMENT_QUOTA_EXCEEDED"
            ? 400
            : result.code === "VIDEO_TYPE_INVALID" ||
                result.code === "VIDEO_SIZE_LIMIT_EXCEEDED" ||
                result.code === "INVALID_REQUEST" ||
                result.code === "UPLOAD_QUARANTINED" ||
                result.code === "UPLOAD_RANGE_INVALID" ||
                result.code === "UPLOAD_INCOMPLETE" ||
                result.code === "HASH_MISMATCH" ||
                result.code === "UPLOAD_NOT_ABORTABLE"
              ? 422
              : 403;
  return reply.code(status).send(safeEnvelope(new Error(result.code), id));
};
const principalResult = (
  store: AuthStore,
  request: FastifyRequest,
  origin: string,
  now: number,
) =>
  authenticateSession(
    store,
    decodeCookieValue(cookie(request, "rvs_session")),
    header(request, "x-csrf-token"),
    header(request, "origin"),
    origin,
    now,
  );

export function buildAuthApp(options: AppOptions): FastifyInstance {
  const featureFlags = options.featureFlags
    ? freezeFeatureFlagSnapshot(options.featureFlags)
    : loadFeatureFlagSnapshot();
  const app = Fastify({ logger: false, bodyLimit: MAX_CHUNK_BYTES });
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );
  // No `parseAs` here on purpose: worker artifact uploads (preview/
  // delivery/evidence-video, up to MAX_ARTIFACT_BYTES) stream this body
  // straight to disk (see uploadArtifact in workers.ts) rather than
  // buffering a large render into memory. `/v1/attachments` also accepts
  // these content types (video/mp4 is in the attachment allowlist) but
  // needs the whole body as bytes to sniff and store -- see I1's fix in
  // this handler's own registration below, which buffers a Readable body
  // itself rather than changing this parser for every route that uses it.
  for (const contentType of [
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "application/x-tar",
  ])
    app.addContentTypeParser(contentType, (_request, body, done) => {
      done(null, body);
    });
  // Job attachments accept arbitrary reference-file mime types (images,
  // PDFs, etc); anything not already claimed by a specific parser above
  // (or by fastify's built-in application/json) is treated as a raw body.
  app.addContentTypeParser(
    "*",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );
  const now = (): number => options.now?.() ?? Date.now();
  const idempotency = options.idempotency ?? new IdempotencyStore();
  app.addHook("onSend", async (request, _reply, payload) => {
    const persistenceRequest = request as FastifyRequest & PersistenceRequest;
    if (!persistenceRequest[requestPersistence]) {
      persistenceRequest[requestPersistence] = true;
      try {
        options.persist?.();
      } catch (error) {
        // Never let this escape. The reply's headers are already on the
        // wire by the time onSend runs, so a rejected hook cannot become
        // an error response -- Fastify tries to write headers anyway and
        // the process dies on ERR_HTTP_HEADERS_SENT. That is how one
        // CHECK-constraint failure took the whole API down and left every
        // worker on 502. The write is lost either way; crashing loses the
        // rest of the service with it.
        //
        // ponytail: logged, not surfaced. Persisting where a failure could
        // still become a 500 means moving it out of onSend, which is a
        // real refactor; do that when a lost write needs to fail the
        // request rather than only page someone.
        console.error(
          JSON.stringify({
            event: "api.persist.failed",
            method: request.method,
            url: request.url,
            errorName: error instanceof Error ? error.name : "UnknownError",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          }),
        );
      }
    }
    return payload;
  });
  app.addHook("onRequest", async (request, reply) => {
    const correlation = correlationId();
    reply.header("x-correlation-id", correlation);
    if (
      request.url.startsWith("/v1/") &&
      !request.url.startsWith("/v1/workers/") &&
      request.url !== "/v1/adobe/relay"
    ) {
      const tenant = header(request, "x-tenant-id");
      const authorization = header(request, "authorization");
      const bearer = authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
      if (!bearer) {
        const principal = principalResult(
          options.store,
          request,
          options.expectedOrigin,
          now(),
        );
        if ("code" in principal) {
          failure(reply, principal);
          return;
        }
        if (tenant && tenant !== principal.tenantId) {
          recordDenied(
            options.store.audit,
            "V1_SESSION_TENANT_DENIED",
            principal,
            tenant,
          );
          failure(reply, { code: "TENANT_BOUNDARY_BYPASS" });
          return;
        }
        (
          request as FastifyRequest & {
            authenticatedPrincipal?: Principal;
          }
        ).authenticatedPrincipal = principal;
        request.headers["x-tenant-id"] = principal.tenantId;
        return;
      }
      const principal = authenticateBearer(
        options.store,
        bearer,
        tenant,
        now(),
      );
      if ("code" in principal) {
        if (!tenant)
          recordDenied(
            options.store.audit,
            "V1_TENANT_HEADER_DENIED",
            undefined,
            null,
          );
        failure(reply, principal);
        return;
      }
      (
        request as FastifyRequest & { authenticatedPrincipal?: Principal }
      ).authenticatedPrincipal = principal;
    }
  });
  const signInRoute = async (
    request: FastifyRequest<{ Body: { email: string; password: string } }>,
    reply: FastifyReply,
  ): Promise<void> => {
    if (header(request, "origin") !== options.expectedOrigin) {
      failure(reply, { code: "CSRF_ORIGIN_INVALID" });
      return;
    }
    const result = signIn(
      options.store,
      request.body.email,
      request.body.password,
      now(),
      options.adminSessionTimeoutMs,
    );
    if (!result.session) {
      reply.code(401).send({
        error: {
          code: "AUTHENTICATION_REQUIRED",
          message: "The request could not be completed.",
        },
      });
      return;
    }
    reply
      .header(
        "set-cookie",
        // The cookie lasts as long as a session possibly can, not as long
        // as one idle window. The server slides expiry forward on every
        // authenticated request (authenticateSession) and refuses past
        // either bound, so it is the authority on both; a cookie pinned to
        // the idle window would instead have the browser throw away a
        // session the server was still happy to accept -- which is what
        // signed people out mid-job.
        sessionCookie(result.session.id, ABSOLUTE_SESSION_MS / 1000),
      )
      .send({ ok: true });
  };
  app.post("/sign-in", signInRoute);
  app.post("/admin/sign-in", signInRoute);
  app.post("/logout", async (request, reply) => {
    const id = cookie(request, "rvs_session");
    if (id) revokeSession(options.store, decodeCookieValue(id), now());
    reply.header("set-cookie", clearSessionCookie()).send({ ok: true });
  });
  app.post(
    "/session/tenant",
    async (request: FastifyRequest<{ Body: { tenantId: string } }>, reply) => {
      const principal = principalResult(
        options.store,
        request,
        options.expectedOrigin,
        now(),
      );
      if ("code" in principal) {
        failure(reply, principal);
        return;
      }
      const rotated = rotateSessionTenant(
        options.store,
        principal.sessionId ?? "",
        request.body.tenantId,
        now(),
        options.adminSessionTimeoutMs,
      );
      if ("code" in rotated) {
        failure(reply, rotated);
        return;
      }
      reply
        .header(
          "set-cookie",
          sessionCookie(rotated.id, ABSOLUTE_SESSION_MS / 1000),
        )
        .send({ ok: true });
    },
  );
  app.get("/bff/session-introspect", async (request, reply) => {
    if (
      header(request, "x-session-introspect-secret") !==
      options.introspectSecret
    ) {
      failure(reply, { code: "AUTHENTICATION_REQUIRED" });
      return;
    }
    const principal = principalResult(
      options.store,
      request,
      options.expectedOrigin,
      now(),
    );
    if ("code" in principal) {
      failure(reply, principal);
      return;
    }
    reply.send({
      opaqueSessionId: principal.sessionId,
      csrf: header(request, "x-csrf-token"),
    });
  });
  app.get("/v1/identity", async (request, reply) => {
    const authorization = header(request, "authorization");
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const principal = authenticateBearer(
      options.store,
      bearer,
      header(request, "x-tenant-id"),
      now(),
    );
    if ("code" in principal) {
      failure(reply, principal);
      return;
    }
    reply.send({ principal });
  });
  const tenantAction = async (
    request: FastifyRequest<{
      Body: {
        readonly resourceTenantId?: string;
        readonly deletionEpoch?: number;
      };
    }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const authorization = header(request, "authorization");
    const bearer = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    const principal = authenticateBearer(
      options.store,
      bearer,
      header(request, "x-tenant-id"),
      now(),
    );
    if ("code" in principal) {
      failure(reply, principal);
      return;
    }
    const resource =
      request.body.deletionEpoch === undefined
        ? { tenantId: request.body.resourceTenantId ?? principal.tenantId }
        : {
            tenantId: request.body.resourceTenantId ?? principal.tenantId,
            deletionEpoch: request.body.deletionEpoch,
          };
    const access = fenceResource(
      principal,
      header(request, "x-tenant-id"),
      resource,
      request.body.deletionEpoch,
    );
    if ("code" in access) {
      recordDenied(
        options.store.audit,
        `TENANT_ACTION_${access.code}`,
        principal,
        principal.tenantId,
      );
      failure(reply, access);
      return;
    }
    const key = header(request, "idempotency-key");
    if (!key) {
      reply.send(options.onTenantAction?.() ?? { ok: true });
      return;
    }
    try {
      const replay = idempotency.execute(
        "tenant-action",
        key,
        requestHash(request.body ?? {}),
        principal.tenantId,
        () => [200, options.onTenantAction?.() ?? { ok: true }],
      );
      reply.code(replay.response[0]).send(replay.response[1]);
    } catch (error) {
      recordDenied(
        options.store.audit,
        "TENANT_ACTION_IDEMPOTENCY_DENIED",
        principal,
        principal.tenantId,
      );
      reply
        .code(400)
        .send(safeEnvelope(error, String(reply.getHeader("x-correlation-id"))));
    }
  };
  app.post("/v1/tenant-actions", tenantAction);
  app.patch("/v1/tenant-actions", tenantAction);
  if (options.uploads) {
    const uploads = options.uploads;
    app.post("/v1/uploads", async (request, reply) => {
      try {
        const tenantId = header(request, "x-tenant-id") ?? "";
        const key = header(request, "idempotency-key");
        if (!key) throw new UploadFailure("INVALID_REQUEST");
        const replay = idempotency.execute(
          "upload-create",
          key,
          requestHash(request.body ?? {}),
          tenantId,
          () => {
            const upload = createUpload(uploads, tenantId, request.body);
            return [
              201,
              {
                uploadId: upload.id,
                chunkSize: MAX_CHUNK_BYTES,
                expiresAt: upload.expiresAt,
                state: upload.state,
              },
            ];
          },
        );
        reply.code(replay.response[0]).send(replay.response[1]);
      } catch (error) {
        if (error instanceof UploadFailure) {
          failure(reply, error);
          return;
        }
        if (error instanceof Error && error.message === "INVALID_REQUEST") {
          failure(reply, new UploadFailure("INVALID_REQUEST"));
          return;
        }
        throw error;
      }
    });
    app.post("/v1/uploads/cleanup", async (_request, reply) => {
      reply.send({ removed: cleanupExpiredUploads(uploads) });
    });
    app.post(
      "/v1/attachments",
      // Fastify's own body-size cutoff must sit above our declared
      // per-attachment limit, or an oversized upload gets fastify's generic
      // 413 instead of the ATTACHMENT_SIZE_LIMIT_EXCEEDED error below.
      { bodyLimit: MAX_ATTACHMENT_BYTES + 1024 },
      async (request, reply) => {
        try {
          const tenantId = header(request, "x-tenant-id") ?? "";
          const key = header(request, "idempotency-key");
          if (!key) throw new UploadFailure("INVALID_REQUEST");
          const body = request.body;
          // I1: a video/mp4|quicktime|webm attachment arrives as a
          // Readable (see bufferReadable's comment) -- video/mp4 is in the
          // attachment allowlist and must actually be able to upload, not
          // fall through to INVALID_REQUEST because it isn't already bytes.
          const bytes =
            body instanceof Uint8Array
              ? body
              : typeof body === "string"
                ? Buffer.from(body)
                : body instanceof Readable
                  ? await bufferReadable(body, MAX_ATTACHMENT_BYTES + 1024)
                  : (() => {
                      throw new UploadFailure("INVALID_REQUEST");
                    })();
          // Same header and encoding as job-attachments.ts. The name is
          // what lets the scene author match a file to the brief that
          // describes it ("use 05_ranking.jpg here"); without it the model
          // gets a list of interchangeable ids.
          const rawFileName = header(request, "x-filename");
          const fileName = (() => {
            if (!rawFileName) return "attachment";
            try {
              return decodeURIComponent(rawFileName);
            } catch {
              return rawFileName;
            }
          })();
          const replay = idempotency.execute(
            "attachment-create",
            key,
            requestHash(Buffer.from(bytes).toString("base64")),
            tenantId,
            () => {
              const attachment = createAttachment(
                uploads,
                tenantId,
                bytes,
                fileName,
              );
              return [201, { attachmentId: attachment.id }];
            },
          );
          reply.code(replay.response[0]).send(replay.response[1]);
        } catch (error) {
          if (error instanceof UploadFailure) {
            failure(reply, error);
            return;
          }
          if (error instanceof Error && error.message === "INVALID_REQUEST") {
            failure(reply, new UploadFailure("INVALID_REQUEST"));
            return;
          }
          throw error;
        }
      },
    );
    app.put(
      "/v1/uploads/:id/chunks/:index",
      async (
        request: FastifyRequest<{
          Params: { id: string; index: string };
        }>,
        reply,
      ) => {
        try {
          const body = request.body;
          const chunk =
            body instanceof Uint8Array
              ? body
              : typeof body === "string"
                ? Buffer.from(body)
                : (() => {
                    throw new UploadFailure("INVALID_REQUEST");
                  })();
          const upload = putChunk(
            uploads,
            header(request, "x-tenant-id") ?? "",
            request.params.id,
            Number(request.params.index),
            chunk,
            header(request, "content-range") ?? "",
            header(request, "x-chunk-sha256") ?? "",
          );
          reply.header("x-received-bytes", upload.actualBytes).code(204).send();
        } catch (error) {
          if (error instanceof UploadFailure) {
            failure(reply, error);
            return;
          }
          throw error;
        }
      },
    );
    app.post(
      "/v1/uploads/:id/finalize",
      async (
        request: FastifyRequest<{
          Params: { id: string };
          Body: unknown;
        }>,
        reply,
      ) => {
        try {
          const expectation = FinalizeUploadSchema.safeParse(request.body);
          const validateUpload = options.validateUpload;
          if (!expectation.success || !validateUpload)
            throw new UploadFailure("INVALID_REQUEST");
          const tenantId = header(request, "x-tenant-id") ?? "";
          const key = header(request, "idempotency-key");
          if (!key) throw new UploadFailure("INVALID_REQUEST");
          const replay = await idempotency.executeAsync(
            `upload-finalize:${request.params.id}`,
            key,
            requestHash(request.body ?? {}),
            tenantId,
            async () => {
              await validateAndFinalizeUpload(
                uploads,
                tenantId,
                request.params.id,
                expectation.data,
                validateUpload,
              );
              return [
                202,
                { uploadId: request.params.id, state: "VALIDATING" },
              ];
            },
          );
          reply.code(replay.response[0]).send(replay.response[1]);
        } catch (error) {
          if (error instanceof UploadFailure) {
            failure(reply, error);
            return;
          }
          if (error instanceof Error && error.message === "INVALID_REQUEST") {
            failure(reply, new UploadFailure("INVALID_REQUEST"));
            return;
          }
          throw error;
        }
      },
    );
    app.get(
      "/v1/uploads/:id",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        try {
          const upload = getUpload(
            uploads,
            header(request, "x-tenant-id") ?? "",
            request.params.id,
          );
          reply.send({
            uploadId: upload.id,
            state: upload.state,
            ...(upload.media ?? {}),
          });
        } catch (error) {
          if (error instanceof UploadFailure) {
            failure(reply, error);
            return;
          }
          throw error;
        }
      },
    );
    app.delete(
      "/v1/uploads/:id",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        try {
          abortUpload(
            uploads,
            header(request, "x-tenant-id") ?? "",
            request.params.id,
          );
          reply.code(202).send({ state: "aborted" });
        } catch (error) {
          if (error instanceof UploadFailure) {
            failure(reply, error);
            return;
          }
          throw error;
        }
      },
    );
    app.post(
      "/v1/uploads/:id/abort",
      async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
        try {
          abortUpload(
            uploads,
            header(request, "x-tenant-id") ?? "",
            request.params.id,
          );
          reply.send({ ok: true });
        } catch (error) {
          if (error instanceof UploadFailure) {
            failure(reply, error);
            return;
          }
          throw error;
        }
      },
    );
  }
  if (options.retention) {
    const retention = options.retention;
    app.post("/v1/retention/cleanup", async (_request, reply) => {
      reply.send({ removed: cleanupRetention(retention) });
    });
    app.post(
      "/v1/tenants/:tenantId/delete",
      async (
        request: FastifyRequest<{ Params: { tenantId: string } }>,
        reply,
      ) => {
        const authorization = header(request, "authorization");
        const bearer = authorization?.startsWith("Bearer ")
          ? authorization.slice(7)
          : "";
        const principal = authenticateBearer(
          options.store,
          bearer,
          header(request, "x-tenant-id"),
          now(),
        );
        if ("code" in principal) {
          failure(reply, principal);
          return;
        }
        if (principal.tenantId !== request.params.tenantId) {
          failure(reply, { code: "TENANT_BOUNDARY_BYPASS" });
          return;
        }
        const deletionEpoch = advanceDeletionEpoch(
          retention,
          principal.tenantId,
        );
        if (options.workers && options.creatorWorkflow)
          fenceTenantJobs(options.workers, options.creatorWorkflow, {
            tenantId: principal.tenantId,
            deletionEpoch,
            now,
          });
        reply.send({ deletionEpoch });
      },
    );
  }
  if (options.creatorWorkflow && options.uploads)
    registerCreatorWorkflow(
      app,
      options.creatorWorkflow,
      options.uploads,
      options.reviews,
      options.workers,
      now,
      options.db && options.aiSecretKey
        ? {
            db: options.db,
            aiSecretKey: options.aiSecretKey,
            ...(options.refinePromptGenerate
              ? { generate: options.refinePromptGenerate }
              : {}),
          }
        : undefined,
      featureFlags,
    );
  if (options.adminReads)
    registerAdminRead(
      app,
      options.store,
      options.adminReads,
      now,
      options.expectedOrigin,
      options.adminSessionTimeoutMs,
      featureFlags,
    );
  if (options.adminMutations)
    registerAdminMutation(
      app,
      options.store,
      options.adminMutations,
      now,
      options.expectedOrigin,
      options.adminSessionTimeoutMs,
    );
  if (options.reviews) registerReviews(app, options.reviews);
  if (
    options.creatorWorkflow &&
    options.uploads &&
    options.db &&
    options.aiSecretKey
  )
    registerRefinePrompt(
      app,
      options.creatorWorkflow,
      options.uploads,
      options.db,
      options.aiSecretKey,
      // Passing `undefined` explicitly still lets registerRefinePrompt's
      // own default parameter (the real generateObject) apply -- this just
      // has to occupy the positional slot so patchSceneGenerate can follow
      // it.
      options.refinePromptGenerate,
      options.patchSceneGenerate,
      featureFlags,
    );
  if (options.creatorWorkflow && options.db && options.attachmentsRoot)
    registerJobAttachments(
      app,
      options.creatorWorkflow,
      options.db,
      options.attachmentsRoot,
    );
  if (options.creatorWorkflow && options.db)
    registerMotionScene(app, options.creatorWorkflow, options.db, featureFlags);
  if (options.db)
    registerAdobeMcpRoutes(
      app,
      options.db,
      options.aiSecretKey ?? options.introspectSecret,
      now,
      featureFlags,
    );
  if (options.workers)
    registerWorkers(app, options.workers, {
      now,
      workflow: options.creatorWorkflow,
      reviews: options.reviews,
      uploads: options.uploads,
      artifactRoot: options.artifactRoot,
      persist: options.persist,
      db: options.db,
      aiSecretKey: options.aiSecretKey,
      safetyCheckGenerate: options.safetyCheckGenerate,
      translateGenerate: options.translateGenerate,
      authorSceneGenerate: options.authorSceneGenerate,
      authorSceneGeneratePlan: options.authorSceneGeneratePlan,
      materialGenerate: options.materialGenerate,
    });
  return app;
}

export { hashBearer };
