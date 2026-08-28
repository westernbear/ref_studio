import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
// I2.1: renamed from MAX_ATTACHMENTS_PER_JOB, which was declared here,
// never imported by anything, and shadowed a differently-valued constant of
// the exact same name in job-attachments.ts (its own trap -- the two names
// looked interchangeable but were not). This one gates POST /v1/attachments
// (the brand-attachment store below), not job-attachments.ts's separate
// per-job attachment system.
export const MAX_ATTACHMENTS_PER_TENANT = 20;
// Total-byte budget across a tenant's attachments, not just a per-file cap
// -- MAX_ATTACHMENT_BYTES alone still let an authenticated tenant post
// MAX_ATTACHMENTS_PER_TENANT files at MAX_ATTACHMENT_BYTES each (400 MB) into
// the in-memory store below with no aggregate limit.
export const MAX_ATTACHMENT_BYTES_PER_TENANT = 100 * 1024 * 1024;

export type UploadState =
  | "PENDING"
  | "VALIDATING"
  | "QUARANTINED"
  | "ACCEPTED"
  | "EXPIRED";
export type UploadMedia = {
  readonly fps: 24 | 25 | 30 | 50 | 60;
  readonly frameCount: number;
  readonly durationSeconds: number;
};
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
  sourceSha256: string | null;
  media: UploadMedia | null;
  readonly chunks: Uint8Array[];
  readonly chunkHashes: string[];
  readonly chunkSizes: number[];
  readonly stagingPath?: string;
  casPath?: string | null;
  actualBytes: number;
};
export type AttachmentContentType =
  | "image/png"
  | "image/jpeg"
  | "image/svg+xml"
  | "font/ttf"
  | "font/otf"
  | "font/woff2"
  | "video/mp4";
export type AttachmentRecord = {
  readonly id: string;
  readonly tenantId: string;
  // What the creator called the file. The scene author needs it: a brief
  // says "use 05_ranking.jpg for the ranking beat", and without the name
  // the model sees twenty interchangeable ids and cannot honour that.
  readonly fileName: string;
  readonly contentType: AttachmentContentType;
  readonly sizeBytes: number;
  // Empty once the bytes are on disk (storagePath set) -- same shape as
  // StoredArtifact in durable-state.ts. Only a store with no
  // attachmentRoot (test fixtures) keeps them resident.
  readonly bytes: Uint8Array;
  readonly storagePath?: string;
  readonly createdAt: string;
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
  // Optional (rather than required-and-empty-by-default) so every existing
  // fixture that builds an UploadStore literal keeps compiling unchanged;
  // createAttachment() lazily initializes this on first use.
  attachments?: Map<string, AttachmentRecord>;
  readonly now: () => number;
  readonly stagingRoot?: string;
  readonly casRoot?: string;
  // Where attachment bytes are written. Unset (test fixtures) keeps them
  // in memory instead; a real deployment always sets it, because an
  // in-memory-only attachment is lost on restart while the job that
  // referenced it survives.
  readonly attachmentRoot?: string;
  readonly audit?: (event: {
    readonly action: string;
    readonly tenantId: string | null;
    readonly decision: string;
  }) => void;
};

export const CreateUploadSchema = z
  .object({
    fileName: z.string().min(1).max(255),
    sizeBytes: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    mimeHint: z.string().max(100).optional(),
  })
  .strict();

export class UploadFailure extends Error {
  readonly code:
    | "INVALID_REQUEST"
    | "VIDEO_SIZE_LIMIT_EXCEEDED"
    | "VIDEO_TYPE_INVALID"
    | "UPLOAD_QUARANTINED"
    | "UPLOAD_RANGE_INVALID"
    | "UPLOAD_INCOMPLETE"
    | "HASH_MISMATCH"
    | "UPLOAD_EXPIRED"
    | "UPLOAD_NOT_ABORTABLE"
    | "RESOURCE_NOT_FOUND"
    | "TENANT_BOUNDARY_BYPASS"
    | "ATTACHMENT_TYPE_INVALID"
    | "ATTACHMENT_SIZE_LIMIT_EXCEEDED"
    | "ATTACHMENT_COUNT_LIMIT_EXCEEDED"
    | "ATTACHMENT_QUOTA_EXCEEDED";
  constructor(code: UploadFailure["code"]) {
    super(code);
    this.code = code;
  }
}

const id = (prefix: string): string =>
  `${prefix}_${randomBytes(12).toString("base64url")}`;
const segment = (value: string): string => encodeURIComponent(value);
const isSafeFilename = (filename: string): boolean =>
  !filename.includes("/") &&
  !filename.includes("\\") &&
  !filename.includes("\0") &&
  filename !== "." &&
  filename !== ".." &&
  !filename.includes("..");
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
// MP4/MOV (ISO-BMFF) carry an "ftyp" box; WebM/Matroska instead open with the
// fixed 4-byte EBML magic number. Recognize either signature, matching the
// mp4/webm containers media-validation.ts's ffprobe pass also accepts.
const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3];
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
  if (EBML_MAGIC.every((byte, index) => prefix[index] === byte)) return true;
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
  const filename = parsed.success ? parsed.data.fileName : "";
  if (!parsed.success || !isSafeFilename(filename))
    throw new UploadFailure(
      !parsed.success &&
      parsed.error.issues.some((issue) => issue.path[0] === "sizeBytes")
        ? "VIDEO_SIZE_LIMIT_EXCEEDED"
        : "INVALID_REQUEST",
    );
  const now = store.now();
  const uploadId = id("upl");
  const acceptedContentTypes = ["video/mp4", "video/quicktime", "video/webm"];
  const contentType =
    parsed.data.mimeHint && acceptedContentTypes.includes(parsed.data.mimeHint)
      ? parsed.data.mimeHint
      : "video/mp4";
  const upload: UploadRecord = {
    id: uploadId,
    tenantId,
    filename,
    contentType,
    sizeBytes: parsed.data.sizeBytes,
    state: "PENDING",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + UPLOAD_TTL_MS).toISOString(),
    casObjectId: null,
    sourceSha256: null,
    media: null,
    chunks: [],
    chunkHashes: [],
    chunkSizes: [],
    ...(store.stagingRoot
      ? {
          stagingPath: join(
            store.stagingRoot,
            segment(tenantId),
            uploadId,
            "source.upload",
          ),
          casPath: null,
        }
      : {}),
    actualBytes: 0,
  };
  if (upload.stagingPath) {
    mkdirSync(join(store.stagingRoot ?? "", segment(tenantId)), {
      recursive: true,
      mode: 0o711,
    });
    mkdirSync(dirname(upload.stagingPath), { recursive: true, mode: 0o700 });
  }
  store.uploads.set(upload.id, upload);
  return upload;
}

const openUpload = (
  store: UploadStore,
  tenantId: string,
  uploadId: string,
): UploadRecord => {
  const upload = owns(store, tenantId, uploadId);
  if (store.now() >= Date.parse(upload.expiresAt)) {
    upload.state = "EXPIRED";
    throw new UploadFailure("UPLOAD_EXPIRED");
  }
  if (upload.state !== "PENDING") throw new UploadFailure("UPLOAD_QUARANTINED");
  return upload;
};

export function putChunk(
  store: UploadStore,
  tenantId: string,
  uploadId: string,
  index: number,
  chunk: Uint8Array,
  contentRange: string,
  declaredSha256: string,
): UploadRecord {
  const upload = openUpload(store, tenantId, uploadId);
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange);
  const start = Number(range?.[1]);
  const end = Number(range?.[2]);
  const total = Number(range?.[3]);
  const actualSha256 = createHash("sha256").update(chunk).digest("hex");
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    !range ||
    total !== upload.sizeBytes ||
    start !== index * MAX_CHUNK_BYTES ||
    end !== start + chunk.byteLength - 1 ||
    end >= total ||
    chunk.byteLength < 1 ||
    chunk.byteLength > MAX_CHUNK_BYTES
  )
    throw new UploadFailure("UPLOAD_RANGE_INVALID");
  if (actualSha256 !== declaredSha256) throw new UploadFailure("HASH_MISMATCH");
  const existingHash = upload.chunkHashes[index];
  if (existingHash) {
    if (existingHash !== declaredSha256)
      throw new UploadFailure("HASH_MISMATCH");
    return upload;
  }
  if (index !== upload.chunks.length)
    throw new UploadFailure("UPLOAD_RANGE_INVALID");
  if (upload.stagingPath) {
    const descriptor = openSync(upload.stagingPath, index === 0 ? "w" : "r+");
    try {
      writeSync(descriptor, chunk, 0, chunk.byteLength, start);
    } finally {
      closeSync(descriptor);
    }
    upload.chunks.push(new Uint8Array());
  } else upload.chunks.push(chunk);
  upload.chunkHashes.push(declaredSha256);
  upload.chunkSizes.push(chunk.byteLength);
  upload.actualBytes += chunk.byteLength;
  return upload;
}

export const FinalizeUploadSchema = z
  .object({
    orderedChunkCount: z.number().int().min(1).max(262_144),
    declaredSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
type FinalizeExpectation = Readonly<z.infer<typeof FinalizeUploadSchema>>;

const fileDigest = (filename: string): string => {
  const descriptor = openSync(filename, "r");
  const digest = createHash("sha256");
  const bytes = Buffer.alloc(64 * 1024);
  try {
    for (
      let count = readSync(descriptor, bytes, 0, bytes.length, null);
      count > 0;

    ) {
      digest.update(bytes.subarray(0, count));
      count = readSync(descriptor, bytes, 0, bytes.length, null);
    }
  } finally {
    closeSync(descriptor);
  }
  return digest.digest("hex");
};

const verifyFinalize = (
  upload: UploadRecord,
  expectation?: FinalizeExpectation,
): string => {
  if (
    upload.state !== "PENDING" ||
    upload.actualBytes !== upload.sizeBytes ||
    (expectation && upload.chunkHashes.length !== expectation.orderedChunkCount)
  )
    throw new UploadFailure("UPLOAD_INCOMPLETE");
  let prefix = upload.chunks;
  if (upload.stagingPath) {
    const descriptor = openSync(upload.stagingPath, "r");
    const bytes = Buffer.alloc(16 * 1024);
    try {
      const count = readSync(descriptor, bytes, 0, bytes.length, 0);
      prefix = [bytes.subarray(0, count)];
    } finally {
      closeSync(descriptor);
    }
  }
  if (!hasFtyp(prefix)) {
    upload.state = "QUARANTINED";
    throw new UploadFailure("VIDEO_TYPE_INVALID");
  }
  const sha256 = upload.stagingPath
    ? fileDigest(upload.stagingPath)
    : (() => {
        const digest = createHash("sha256");
        for (const chunk of upload.chunks) digest.update(chunk);
        return digest.digest("hex");
      })();
  if (expectation && sha256 !== expectation.declaredSha256)
    throw new UploadFailure("HASH_MISMATCH");
  return sha256;
};

const acceptUpload = (
  store: UploadStore,
  upload: UploadRecord,
  sha256: string,
): UploadRecord => {
  const key = `${upload.tenantId}:${sha256}`;
  const existingId = store.casByTenantDigest.get(key);
  const casObjectId = existingId ?? id("cas");
  if (!existingId) {
    store.casByTenantDigest.set(key, casObjectId);
    store.cas.set(casObjectId, {
      id: casObjectId,
      tenantId: upload.tenantId,
      sha256,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      purpose: "SOURCE",
      retentionUntil: new Date(store.now() + UPLOAD_TTL_MS).toISOString(),
    });
  }
  if (upload.stagingPath && store.casRoot) {
    const directory = join(store.casRoot, segment(upload.tenantId));
    const destination = join(directory, sha256);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!existsSync(destination)) {
      const temporary = `${destination}.${id("tmp")}`;
      copyFileSync(upload.stagingPath, temporary);
      const descriptor = openSync(temporary, "r");
      try {
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      renameSync(temporary, destination);
    }
    upload.casPath = destination;
  } else if (store.casRoot)
    upload.casPath = join(store.casRoot, segment(upload.tenantId), sha256);
  upload.casObjectId = casObjectId;
  upload.sourceSha256 = sha256;
  upload.state = "ACCEPTED";
  return upload;
};

const verifyAcceptedReplay = (
  upload: UploadRecord,
  expectation?: FinalizeExpectation,
): boolean => {
  if (upload.state !== "ACCEPTED") return false;
  if (
    expectation &&
    upload.chunkHashes.length !== expectation.orderedChunkCount
  )
    throw new UploadFailure("UPLOAD_INCOMPLETE");
  if (expectation && upload.sourceSha256 !== expectation.declaredSha256)
    throw new UploadFailure("HASH_MISMATCH");
  return true;
};

export function finalizeUpload(
  store: UploadStore,
  tenantId: string,
  uploadId: string,
  expectation?: FinalizeExpectation,
): UploadRecord {
  const upload = owns(store, tenantId, uploadId);
  if (verifyAcceptedReplay(upload, expectation)) return upload;
  return acceptUpload(store, upload, verifyFinalize(upload, expectation));
}

export async function validateAndFinalizeUpload(
  store: UploadStore,
  tenantId: string,
  uploadId: string,
  expectation: FinalizeExpectation,
  validate: (
    upload: UploadRecord,
    sourceSha256: string,
  ) => Promise<UploadMedia>,
): Promise<UploadRecord> {
  const upload = owns(store, tenantId, uploadId);
  if (verifyAcceptedReplay(upload, expectation)) return upload;
  const sourceSha256 = verifyFinalize(upload, expectation);
  upload.state = "VALIDATING";
  try {
    upload.media = await validate(upload, sourceSha256);
  } catch {
    upload.state = "QUARANTINED";
    throw new UploadFailure("VIDEO_TYPE_INVALID");
  }
  return acceptUpload(store, upload, sourceSha256);
}

export const getUpload = (
  store: UploadStore,
  tenantId: string,
  uploadId: string,
): UploadRecord => owns(store, tenantId, uploadId);

export function abortUpload(
  store: UploadStore,
  tenantId: string,
  uploadId: string,
): void {
  const upload = owns(store, tenantId, uploadId);
  if (upload.state !== "PENDING" && upload.state !== "VALIDATING")
    throw new UploadFailure("UPLOAD_NOT_ABORTABLE");
  upload.state = "EXPIRED";
  if (upload.stagingPath)
    rmSync(dirname(upload.stagingPath), { force: true, recursive: true });
}
export function cleanupExpiredUploads(store: UploadStore): number {
  const now = store.now();
  let removed = 0;
  for (const [uploadId, upload] of store.uploads)
    if (
      ["PENDING", "VALIDATING", "EXPIRED"].includes(upload.state) &&
      Date.parse(upload.expiresAt) <= now
    ) {
      store.uploads.delete(uploadId);
      if (upload.stagingPath)
        rmSync(dirname(upload.stagingPath), {
          force: true,
          recursive: true,
        });
      removed += 1;
    }
  return removed;
}

export const uploadSourcePath = (upload: UploadRecord): string | undefined =>
  upload.casPath ?? upload.stagingPath;

// Brand attachments (logos, fonts, brand video) that a generation brief
// references by id. These are job *inputs*, uploaded before a job exists,
// so they share the upload store rather than living alongside job output
// artifacts. The declared content-type header is client-controlled and is
// therefore never trusted for the accept/reject decision below -- only the
// bytes on the wire are.
//
// Durable since migration 014: bytes go to disk under
// UploadStore.attachmentRoot at creation, metadata to runtime_attachments
// in the durable-state snapshot, and both come back on hydrate. Before
// that this Map was the only copy, so an API restart between the upload
// and the assets stage lost every attachment while the job that
// referenced one survived -- ten minutes of analysis, compilation and
// preview, then ATTACHMENT_UNRESOLVED.
//
// ponytail: still not swept. Neither cleanupExpiredUploads nor
// retention.ts's sweep removes an attachment, and tenant deletion leaves
// its bytes on disk, so a tenant's attachments accumulate up to the
// per-tenant cap below (20 files, 100 MB) and stay there. Add a sweep when
// that ceiling is the wrong one -- it is bounded, which is what the
// unbounded in-memory version was not.
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const OTF_MAGIC = [0x4f, 0x54, 0x54, 0x4f]; // "OTTO"
const TTF_MAGIC = [0x00, 0x01, 0x00, 0x00];
const WOFF2_MAGIC = [0x77, 0x4f, 0x46, 0x32]; // "wOF2"

const startsWithMagic = (
  bytes: Uint8Array,
  magic: readonly number[],
): boolean =>
  magic.length <= bytes.length &&
  magic.every((byte, index) => bytes[index] === byte);

const isMp4Attachment = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 && String.fromCharCode(...bytes.subarray(4, 8)) === "ftyp";

const isSvgAttachment = (bytes: Uint8Array): boolean => {
  const head = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 512)))
    .toString("utf8")
    .trimStart()
    .toLowerCase();
  return head.startsWith("<?xml") || head.startsWith("<svg");
};

const detectAttachmentContentType = (
  bytes: Uint8Array,
): AttachmentContentType | null => {
  if (startsWithMagic(bytes, PNG_MAGIC)) return "image/png";
  if (startsWithMagic(bytes, JPEG_MAGIC)) return "image/jpeg";
  if (startsWithMagic(bytes, OTF_MAGIC)) return "font/otf";
  if (startsWithMagic(bytes, WOFF2_MAGIC)) return "font/woff2";
  if (startsWithMagic(bytes, TTF_MAGIC)) return "font/ttf";
  if (isMp4Attachment(bytes)) return "video/mp4";
  if (isSvgAttachment(bytes)) return "image/svg+xml";
  return null;
};

// Strips path separators and control characters so a hostile filename
// can't escape a storage directory or corrupt logs. Shared with
// job-attachments.ts, which had the only copy.
export const sanitizeFilename = (raw: string): string => {
  const stripped = raw
    .replace(/[/\\]/gu, "_")
    .split("")
    .filter((char) => char.charCodeAt(0) >= 32)
    .join("")
    .slice(0, 200);
  return stripped || "attachment";
};

export function createAttachment(
  store: UploadStore,
  tenantId: string,
  bytes: Uint8Array,
  fileName = "attachment",
): AttachmentRecord {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1)
    throw new UploadFailure("INVALID_REQUEST");
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES)
    throw new UploadFailure("ATTACHMENT_SIZE_LIMIT_EXCEEDED");
  const contentType = detectAttachmentContentType(bytes);
  if (!contentType) throw new UploadFailure("ATTACHMENT_TYPE_INVALID");
  const attachments = store.attachments ?? new Map<string, AttachmentRecord>();
  store.attachments = attachments;
  // I2.1: per-tenant count and total-byte budget. Without this, an
  // authenticated tenant could POST attachments up to MAX_ATTACHMENT_BYTES
  // each, with no aggregate cap, until the API ran out of memory -- this
  // store is in-memory only (see the docstring above).
  let existingCount = 0;
  let existingBytes = 0;
  for (const attachment of attachments.values())
    if (attachment.tenantId === tenantId) {
      existingCount += 1;
      existingBytes += attachment.sizeBytes;
    }
  if (existingCount >= MAX_ATTACHMENTS_PER_TENANT)
    throw new UploadFailure("ATTACHMENT_COUNT_LIMIT_EXCEEDED");
  if (existingBytes + bytes.byteLength > MAX_ATTACHMENT_BYTES_PER_TENANT)
    throw new UploadFailure("ATTACHMENT_QUOTA_EXCEEDED");
  const attachmentId = id("att");
  // Bytes to disk when the store has a root, so a restart does not lose
  // them: this Map used to be the only copy, and losing it while the job
  // that referenced these survived turned ten minutes of analysis,
  // compilation and preview into ATTACHMENT_UNRESOLVED.
  const stored = ((): Pick<AttachmentRecord, "bytes" | "storagePath"> => {
    if (!store.attachmentRoot) return { bytes };
    const directory = join(store.attachmentRoot, segment(tenantId));
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const storagePath = join(directory, segment(attachmentId));
    const temporary = `${storagePath}.tmp`;
    writeFileSync(temporary, bytes, { mode: 0o600, flush: true });
    renameSync(temporary, storagePath);
    return { bytes: new Uint8Array(), storagePath };
  })();
  const record: AttachmentRecord = {
    id: attachmentId,
    tenantId,
    fileName: sanitizeFilename(fileName),
    contentType,
    sizeBytes: bytes.byteLength,
    ...stored,
    createdAt: new Date(store.now()).toISOString(),
  };
  attachments.set(record.id, record);
  return record;
}

export const ownedAttachment = (
  store: UploadStore,
  tenantId: string,
  attachmentId: string,
): AttachmentRecord => {
  const attachment = store.attachments?.get(attachmentId);
  if (!attachment) throw new UploadFailure("RESOURCE_NOT_FOUND");
  if (attachment.tenantId !== tenantId) {
    store.audit?.({
      action: "ATTACHMENT_TENANT_DENIED",
      tenantId,
      decision: "DENIED",
    });
    throw new UploadFailure("RESOURCE_NOT_FOUND");
  }
  return attachment;
};
