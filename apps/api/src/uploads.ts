import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;

export type UploadState = "PENDING" | "QUARANTINED" | "ACCEPTED" | "EXPIRED";
export type UploadRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  state: UploadState;
  readonly createdAt: string;
  readonly expiresAt: string;
  casObjectId: string | null;
  readonly chunks: Uint8Array[];
  actualBytes: number;
};
export type CasRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly sha256: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly purpose: "SOURCE";
  readonly retentionUntil: string;
};
export type UploadStore = {
  readonly uploads: Map<string, UploadRecord>;
  readonly cas: Map<string, CasRecord>;
  readonly casByTenantDigest: Map<string, string>;
  readonly now: () => number;
  readonly audit?: (event: {
    readonly action: string;
    readonly tenantId: string | null;
    readonly decision: string;
  }) => void;
};

export const CreateUploadSchema = z
  .object({
    filename: z.string().min(1).max(255),
    contentType: z.literal("video/mp4"),
    sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  })
  .strict();

export class UploadFailure extends Error {
  readonly code:
    | "INVALID_REQUEST"
    | "VIDEO_SIZE_LIMIT_EXCEEDED"
    | "VIDEO_TYPE_INVALID"
    | "UPLOAD_QUARANTINED"
    | "RESOURCE_NOT_FOUND"
    | "TENANT_BOUNDARY_BYPASS";
  constructor(code: UploadFailure["code"]) {
    super(code);
    this.code = code;
  }
}

const id = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString("base64url")}`;
const isSafeFilename = (filename: string): boolean =>
  !filename.includes("/") &&
  !filename.includes("\\") &&
  !filename.includes("\0") &&
  filename !== "." &&
  filename !== ".." &&
  !filename.includes("..");
const visibleUpload = (
  upload: UploadRecord,
): Omit<UploadRecord, "chunks" | "actualBytes"> => {
  const { chunks: _chunks, actualBytes: _actualBytes, ...safe } = upload;
  return safe;
};
const owns = (
  store: UploadStore,
  tenantId: string,
  uploadId: string,
): UploadRecord => {
  const upload = store.uploads.get(uploadId);
  if (!upload) throw new UploadFailure("RESOURCE_NOT_FOUND");
  if (upload.tenantId !== tenantId) {
    store.audit?.({
      action: "UPLOAD_TENANT_DENIED",
      tenantId,
      decision: "DENIED",
    });
    throw new UploadFailure("RESOURCE_NOT_FOUND");
  }
  return upload;
};
const hasFtyp = (chunks: readonly Uint8Array[]): boolean => {
  const prefix = new Uint8Array(
    Math.min(
      16 * 1024,
      chunks.reduce((total, chunk) => total + chunk.byteLength, 0),
    ),
  );
  let cursor = 0;
  for (const chunk of chunks) {
    const copy = chunk.subarray(0, prefix.length - cursor);
    prefix.set(copy, cursor);
    cursor += copy.length;
    if (cursor === prefix.length) break;
  }
  for (let offset = 4; offset + 8 <= prefix.length; offset += 1)
    if (String.fromCharCode(...prefix.subarray(offset, offset + 4)) === "ftyp")
      return true;
  return false;
};

export function createUpload(
  store: UploadStore,
  tenantId: string,
  input: unknown,
): UploadRecord {
  const parsed = CreateUploadSchema.safeParse(input);
  if (!parsed.success || !isSafeFilename(parsed.data.filename))
    throw new UploadFailure(
      !parsed.success &&
        parsed.error.issues.some((issue) => issue.path[0] === "sizeBytes")
        ? "VIDEO_SIZE_LIMIT_EXCEEDED"
        : "INVALID_REQUEST",
    );
  const now = store.now();
  const upload: UploadRecord = {
    id: id("upl"),
    tenantId,
    filename: parsed.data.filename,
    contentType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
    state: "PENDING",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + UPLOAD_TTL_MS).toISOString(),
    casObjectId: null,
    chunks: [],
    actualBytes: 0,
  };
  store.uploads.set(upload.id, upload);
  return upload;
}

export function appendChunk(
  store: UploadStore,
  tenantId: string,
  uploadId: string,
  chunk: Uint8Array,
): UploadRecord {
  const upload = owns(store, tenantId, uploadId);
  if (store.now() >= Date.parse(upload.expiresAt)) {
    upload.state = "EXPIRED";
    throw new UploadFailure("UPLOAD_QUARANTINED");
  }
  if (
    chunk.byteLength > MAX_CHUNK_BYTES ||
    upload.actualBytes + chunk.byteLength > upload.sizeBytes
  )
    throw new UploadFailure("VIDEO_SIZE_LIMIT_EXCEEDED");
  if (upload.state !== "PENDING") throw new UploadFailure("UPLOAD_QUARANTINED");
  upload.chunks.push(chunk);
  upload.actualBytes += chunk.byteLength;
  return upload;
}

export function finalizeUpload(
  store: UploadStore,
  tenantId: string,
  uploadId: string,
): UploadRecord {
  const upload = owns(store, tenantId, uploadId);
  if (upload.state === "ACCEPTED") return upload;
  if (upload.state !== "PENDING" || upload.actualBytes !== upload.sizeBytes)
    throw new UploadFailure(
      upload.actualBytes > upload.sizeBytes
        ? "VIDEO_SIZE_LIMIT_EXCEEDED"
        : "UPLOAD_QUARANTINED",
    );
  if (!hasFtyp(upload.chunks)) {
    upload.state = "QUARANTINED";
    throw new UploadFailure("VIDEO_TYPE_INVALID");
  }
  const digest = createHash("sha256");
  for (const chunk of upload.chunks) digest.update(chunk);
  const sha256 = digest.digest("hex");
  const key = `${tenantId}:${sha256}`;
  const existingId = store.casByTenantDigest.get(key);
  const casObjectId = existingId ?? id("cas");
  if (!existingId) {
    store.casByTenantDigest.set(key, casObjectId);
    store.cas.set(casObjectId, {
      id: casObjectId,
      tenantId,
      sha256,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      purpose: "SOURCE",
      retentionUntil: new Date(store.now() + UPLOAD_TTL_MS).toISOString(),
    });
  }
  upload.casObjectId = casObjectId;
  upload.state = "ACCEPTED";
  return upload;
}

export function abortUpload(
  store: UploadStore,
  tenantId: string,
  uploadId: string,
): void {
  const upload = owns(store, tenantId, uploadId);
  if (upload.state === "PENDING") upload.state = "EXPIRED";
}
export function cleanupExpiredUploads(store: UploadStore): number {
  const now = store.now();
  let removed = 0;
  for (const [uploadId, upload] of store.uploads)
    if (upload.state !== "ACCEPTED" && Date.parse(upload.expiresAt) <= now) {
      store.uploads.delete(uploadId);
      removed += 1;
    }
  return removed;
}
export { isSafeFilename, visibleUpload };
