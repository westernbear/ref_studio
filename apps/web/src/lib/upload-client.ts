import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export type UploadProgress = {
  readonly uploadPercent: number;
  readonly validationPercent: number;
};
export type AcceptedMedia = {
  readonly uploadId: string;
  readonly fps: number;
  readonly frameCount: number;
  readonly durationSeconds: number;
};

export const requestId = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const value = bytesToHex(bytes);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
};
const commandHeaders = (key: string): Record<string, string> => ({
  "idempotency-key": key,
  "x-correlation-id": requestId(),
});

const request = async (
  path: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<Record<string, unknown>> => {
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(path, {
    ...init,
    signal,
    headers,
  });
  const raw = await response.text();
  let body: Record<string, unknown> = {};
  try {
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    if (response.ok) throw new Error("NETWORK_INTERRUPTED");
  }
  if (!response.ok) {
    const code =
      typeof body.code === "string"
        ? body.code
        : text(record(body.error).code) || "NETWORK_INTERRUPTED";
    if (code === "AUTHENTICATION_REQUIRED") {
      const returnTo = `${window.location.pathname}${window.location.search}`;
      window.location.assign(
        `/sign-in?returnTo=${encodeURIComponent(returnTo)}`,
      );
    }
    throw new Error(code);
  }
  return body;
};
const wait = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const aborted = () => {
      window.clearTimeout(timeout);
      reject(signal.reason);
    };
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", aborted, { once: true });
  });
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

export async function uploadMp4(
  file: File,
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal,
): Promise<AcceptedMedia> {
  const created = await request(
    "/api/v1/uploads",
    {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        mimeHint: "video/mp4",
        sizeBytes: file.size,
      }),
      headers: commandHeaders(`upload:${requestId()}`),
    },
    signal,
  );
  const uploadId = text(created.uploadId);
  if (!uploadId) throw new Error("NETWORK_INTERRUPTED");
  const chunkSize = Number(created.chunkSize);
  if (!Number.isInteger(chunkSize) || chunkSize < 1)
    throw new Error("NETWORK_INTERRUPTED");
  const sourceHash = sha256.create();
  let chunkCount = 0;
  for (
    let offset = 0, index = 0;
    offset < file.size;
    offset += chunkSize, index += 1
  ) {
    const chunkBuffer = await file
      .slice(offset, Math.min(offset + chunkSize, file.size))
      .arrayBuffer();
    const chunk = new Uint8Array(chunkBuffer);
    sourceHash.update(chunk);
    await request(
      `/api/v1/uploads/${encodeURIComponent(uploadId)}/chunks/${index}`,
      {
        method: "PUT",
        body: chunkBuffer,
        headers: {
          "content-type": "application/octet-stream",
          "content-range": `bytes ${offset}-${offset + chunk.byteLength - 1}/${file.size}`,
          "x-chunk-sha256": bytesToHex(sha256(chunk)),
        },
      },
      signal,
    );
    onProgress({
      uploadPercent: Math.round(
        (Math.min(offset + chunk.byteLength, file.size) / file.size) * 100,
      ),
      validationPercent: 0,
    });
    chunkCount = index + 1;
  }
  await request(
    `/api/v1/uploads/${encodeURIComponent(uploadId)}/finalize`,
    {
      method: "POST",
      body: JSON.stringify({
        orderedChunkCount: chunkCount,
        declaredSha256: bytesToHex(sourceHash.digest()),
      }),
      headers: commandHeaders(`finalize:${uploadId}`),
    },
    signal,
  );
  for (let attempt = 0; attempt < 480; attempt += 1) {
    const status = await request(
      `/api/v1/uploads/${encodeURIComponent(uploadId)}`,
      { method: "GET" },
      signal,
    );
    if (status.state === "ACCEPTED") {
      const fps = Number(status.fps);
      const frameCount = Number(status.frameCount);
      const durationSeconds = Number(status.durationSeconds);
      if (
        ![24, 25, 30, 50, 60].includes(fps) ||
        !Number.isInteger(frameCount) ||
        frameCount < fps * 4 ||
        !Number.isFinite(durationSeconds)
      )
        throw new Error("MEDIA_METADATA_INVALID");
      onProgress({ uploadPercent: 100, validationPercent: 100 });
      return { uploadId, fps, frameCount, durationSeconds };
    }
    if (["QUARANTINED", "EXPIRED"].includes(String(status.state)))
      throw new Error("VIDEO_TYPE_INVALID");
    onProgress({ uploadPercent: 100, validationPercent: 50 });
    await wait(250, signal);
  }
  throw new Error("NETWORK_INTERRUPTED");
}

export async function createCompilerJob(
  media: AcceptedMedia,
  startFrame: number,
  signal: AbortSignal,
): Promise<string> {
  const body = await request(
    "/api/v1/jobs",
    {
      method: "POST",
      body: JSON.stringify({
        uploadId: media.uploadId,
        startFrame,
        sourceFps: media.fps,
        outputProfile: "vertical-1080p30",
      }),
      headers: {
        ...commandHeaders(`job:${media.uploadId}:${startFrame}`),
      },
    },
    signal,
  );
  const jobId = text(body.id).trim();
  if (!jobId) throw new Error("NETWORK_INTERRUPTED");
  return jobId;
}
