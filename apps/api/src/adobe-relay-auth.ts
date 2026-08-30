import { createHmac, timingSafeEqual } from "node:crypto";
import {
  AdobeCommandEnvelopeV1Schema,
  AdobeCommandResultV1Schema,
  AdobeRelaySignatureV1Schema,
  type AdobeRelaySignatureV1,
} from "../../../packages/contracts/src/adobe.js";
import {
  canonicalJson,
  sha256Hex,
} from "../../../packages/contracts/src/canonical-json.js";
import {
  RESOURCE_BUDGETS,
} from "../../../packages/contracts/src/resource-budgets.js";
import {
  AdobeRelayFailure,
  type AdobeGatewayStore,
} from "./adobe-mcp-gateway.js";

const MAX_SKEW_MS = 300_000;
const MAX_BODY_BYTES = RESOURCE_BUDGETS.maxRelayBodyBytes;

const signingPayload = (signature: AdobeRelaySignatureV1): string =>
  [
    signature.keyId,
    String(signature.timestampMs),
    signature.requestId,
    signature.nonce,
    signature.bodyHash,
  ].join("\n");

export const verifyAdobeRelay = (
  store: AdobeGatewayStore,
  body: unknown,
  input: unknown,
  now: number,
): Readonly<{ tenantId: string; deviceId: string }> => {
  const signature = AdobeRelaySignatureV1Schema.parse(input);
  if (Math.abs(now - signature.timestampMs) > MAX_SKEW_MS)
    throw new AdobeRelayFailure("ADOBE_RELAY_TIMESTAMP_INVALID");
  const key = store.key(signature.keyId);
  if (
    key === undefined ||
    key.revokedAtMs !== null ||
    signature.timestampMs < key.notBeforeMs ||
    signature.timestampMs >= key.expiresAtMs
  )
    throw new AdobeRelayFailure("ADOBE_RELAY_KEY_INVALID");
  const canonical = canonicalJson(body);
  if (
    new TextEncoder().encode(canonical).byteLength > MAX_BODY_BYTES ||
    sha256Hex(body) !== signature.bodyHash
  )
    throw new AdobeRelayFailure("ADOBE_RELAY_BODY_INVALID");
  const expected = createHmac("sha256", key.secret)
    .update(signingPayload(signature))
    .digest();
  const provided = Buffer.from(signature.signature, "hex");
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  )
    throw new AdobeRelayFailure("ADOBE_RELAY_SIGNATURE_INVALID");
  const binding =
    typeof body === "object" && body !== null && "command" in body
      ? AdobeCommandEnvelopeV1Schema.parse(body.command)
      : typeof body === "object" && body !== null && "result" in body
        ? AdobeCommandResultV1Schema.parse(body.result)
        : AdobeCommandEnvelopeV1Schema.parse(undefined);
  if (binding.deviceId !== key.deviceId)
    throw new AdobeRelayFailure("ADOBE_RELAY_BINDING_REJECTED");
  if (!store.consumeNonce(key.deviceId, signature.keyId, signature.nonce))
    throw new AdobeRelayFailure("ADOBE_RELAY_REPLAY");
  return { tenantId: key.tenantId, deviceId: key.deviceId };
};
