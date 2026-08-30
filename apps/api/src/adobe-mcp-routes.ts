import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  AdobeDeviceEnrollmentRequestV1Schema,
  AdobeRelayRequestV1Schema,
  AdobeRelayResultRequestV1Schema,
} from "../../../packages/contracts/src/adobe.js";
import type { Principal } from "./auth.js";
import { safeEnvelope } from "./boundary.js";
import type { FeatureFlagSnapshot } from "./feature-flags.js";
import {
  AdobeRelayFailure,
  createAdobeGatewayStore,
} from "./adobe-mcp-gateway.js";
import { verifyAdobeRelay } from "./adobe-relay-auth.js";
import type Database from "better-sqlite3";
import { z } from "zod";

const DeviceIdSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^[A-Za-z0-9:._-]+$/u);

const principal = (request: FastifyRequest): Principal | undefined =>
  (
    request as FastifyRequest & {
      authenticatedPrincipal?: Principal;
    }
  ).authenticatedPrincipal;

const signatureHeaders = (request: FastifyRequest): unknown => ({
  keyId: request.headers["x-rvs-key-id"],
  timestampMs: Number(request.headers["x-rvs-timestamp-ms"]),
  requestId: request.headers["x-rvs-request-id"],
  nonce: request.headers["x-rvs-nonce"],
  bodyHash: request.headers["x-rvs-body-hash"],
  signature: request.headers["x-rvs-signature"],
});

const reject = (reply: FastifyReply, error: unknown) => {
  const correlation = String(reply.getHeader("x-correlation-id") ?? "unknown");
  const failure =
    error instanceof AdobeRelayFailure
      ? error
      : new AdobeRelayFailure("ADOBE_RELAY_REQUEST_INVALID");
  return reply
    .code(failure.code.endsWith("NOT_FOUND") ? 404 : 403)
    .send(safeEnvelope(failure, correlation));
};

export const registerAdobeMcpRoutes = (
  app: FastifyInstance,
  db: Database.Database,
  masterSecret: string,
  now: () => number,
  flags: FeatureFlagSnapshot,
): void => {
  const store = createAdobeGatewayStore(db, now, masterSecret);

  app.get("/v1/adobe/devices", async (request, reply) => {
    if (!flags.adobeMcp) return reply.code(404).send();
    const actor = principal(request);
    if (actor === undefined)
      return reject(
        reply,
        new AdobeRelayFailure("ADOBE_RELAY_REQUEST_INVALID"),
      );
    return reply.send({ version: 1, devices: store.list(actor.tenantId) });
  });

  const enrollDevice = async (
    request: FastifyRequest<{ Params: { deviceId?: string } }>,
    reply: FastifyReply,
  ) => {
    try {
      if (!flags.adobeMcp) return reply.code(404).send();
      const actor = principal(request);
      if (actor === undefined)
        throw new AdobeRelayFailure("ADOBE_RELAY_REQUEST_INVALID");
      const input = AdobeDeviceEnrollmentRequestV1Schema.parse(request.body);
      const pathDeviceId =
        request.params.deviceId === undefined
          ? undefined
          : DeviceIdSchema.parse(request.params.deviceId);
      if (
        pathDeviceId !== undefined &&
        input.deviceId !== undefined &&
        pathDeviceId !== input.deviceId
      )
        throw new AdobeRelayFailure("ADOBE_RELAY_BINDING_REJECTED");
      return reply
        .code(201)
        .send(
          store.enroll(
            actor.tenantId,
            input.name,
            pathDeviceId ?? input.deviceId,
          ),
        );
    } catch (error) {
      return reject(reply, error);
    }
  };

  app.post("/v1/adobe/devices/enroll", enrollDevice);
  app.post("/v1/adobe/devices/:deviceId/enroll", enrollDevice);

  app.post(
    "/v1/adobe/relay",
    { bodyLimit: 262_144 },
    async (request, reply) => {
      try {
        if (!flags.adobeMcp) return reply.code(404).send();
        const input = AdobeRelayRequestV1Schema.parse(request.body);
        const authenticated = verifyAdobeRelay(
          store,
          input,
          signatureHeaders(request),
          now(),
        );
        const status = store.enqueue(authenticated.tenantId, input.command);
        return reply.code(202).send(status);
      } catch (error) {
        const code =
          error instanceof AdobeRelayFailure
            ? error.code
            : "ADOBE_RELAY_REQUEST_INVALID";
        console.warn(
          JSON.stringify({
            event: "adobe.relay.rejected",
            code,
            requestId: request.headers["x-rvs-request-id"] ?? null,
          }),
        );
        return reject(reply, error);
      }
    },
  );

  app.post(
    "/v1/adobe/results",
    { bodyLimit: 262_144 },
    async (request, reply) => {
      try {
        if (!flags.adobeMcp) return reply.code(404).send();
        const input = AdobeRelayResultRequestV1Schema.parse(request.body);
        const authenticated = verifyAdobeRelay(
          store,
          input,
          signatureHeaders(request),
          now(),
        );
        return reply.send(store.complete(authenticated.tenantId, input.result));
      } catch (error) {
        return reject(reply, error);
      }
    },
  );

  app.get(
    "/v1/adobe/commands/:commandId",
    async (
      request: FastifyRequest<{ Params: { commandId: string } }>,
      reply,
    ) => {
      try {
        if (!flags.adobeMcp) return reply.code(404).send();
        const actor = principal(request);
        if (actor === undefined)
          throw new AdobeRelayFailure("ADOBE_RELAY_REQUEST_INVALID");
        return reply.send(
          store.status(actor.tenantId, request.params.commandId),
        );
      } catch (error) {
        return reject(reply, error);
      }
    },
  );
};
