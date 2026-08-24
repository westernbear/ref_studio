import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import {
  authenticateBearer,
  authenticateReleaseBearer,
  authenticateSession,
  authorizeReleaseReview,
  clearSessionCookie,
  hashBearer,
  revokeSession,
  rotateSessionTenant,
  sessionCookie,
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
  createUpload,
  FinalizeUploadSchema,
  getUpload,
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
  const app = Fastify({ logger: false, bodyLimit: MAX_CHUNK_BYTES });
  app.addContentTypeParser(
    "application/octet-stream",
    { parseAs: "buffer" },
    (_request, body, done) => {
      done(null, body);
    },
  );
  app.addContentTypeParser("video/mp4", (_request, body, done) => {
    done(null, body);
  });
  const now = (): number => options.now?.() ?? Date.now();
  const idempotency = options.idempotency ?? new IdempotencyStore();
  app.addHook("onSend", async (request, _reply, payload) => {
    const persistenceRequest = request as FastifyRequest & PersistenceRequest;
    if (!persistenceRequest[requestPersistence]) {
      persistenceRequest[requestPersistence] = true;
      options.persist?.();
    }
    return payload;
  });
  app.addHook("onRequest", async (request, reply) => {
    const correlation = correlationId();
    reply.header("x-correlation-id", correlation);
    if (
      request.url.startsWith("/v1/") &&
      !request.url.startsWith("/v1/workers/") &&
      !(request.method === "POST" && request.url === "/v1/release-reviews")
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
      .header("set-cookie", sessionCookie(result.session.id))
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
      );
      if ("code" in rotated) {
        failure(reply, rotated);
        return;
      }
      reply.header("set-cookie", sessionCookie(rotated.id)).send({ ok: true });
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
    );
  if (options.adminReads)
    registerAdminRead(
      app,
      options.store,
      options.adminReads,
      now,
      options.expectedOrigin,
    );
  if (options.adminMutations)
    registerAdminMutation(
      app,
      options.store,
      options.adminMutations,
      now,
      options.expectedOrigin,
    );
  if (options.reviews)
    registerReviews(
      app,
      options.store,
      options.reviews,
      options.creatorWorkflow,
      now,
    );
  else
    app.post("/v1/release-reviews", async (request, reply) => {
      const authorization = header(request, "authorization");
      const bearer = authorization?.startsWith("Bearer ")
        ? authorization.slice(7)
        : "";
      const principal = authenticateReleaseBearer(options.store, bearer, now());
      if ("code" in principal) {
        failure(reply, principal);
        return;
      }
      const gate = authorizeReleaseReview(
        options.store,
        principal,
        header(request, "x-tenant-id"),
      );
      if (gate) {
        failure(reply, gate);
        return;
      }
      reply.send({ ok: true });
    });
  if (options.workers)
    registerWorkers(app, options.workers, {
      now,
      workflow: options.creatorWorkflow,
      reviews: options.reviews,
      uploads: options.uploads,
      artifactRoot: options.artifactRoot,
      persist: options.persist,
    });
  return app;
}

export { hashBearer };
