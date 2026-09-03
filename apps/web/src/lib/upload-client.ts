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

export const requestId = (): string => crypto.randomUUID();

const bytesToHex = (bytes: Uint8Array): string =>
  [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const sha256Hex = async (data: BufferSource): Promise<string> =>
  bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
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
        mimeHint: file.type || "video/mp4",
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
  const fileBuffer = await file.arrayBuffer();
  const declaredSha256 = await sha256Hex(fileBuffer);
  let chunkCount = 0;
  for (
    let offset = 0, index = 0;
    offset < file.size;
    offset += chunkSize, index += 1
  ) {
    const chunkBuffer = fileBuffer.slice(
      offset,
      Math.min(offset + chunkSize, file.size),
    );
    await request(
      `/api/v1/uploads/${encodeURIComponent(uploadId)}/chunks/${index}`,
      {
        method: "PUT",
        body: chunkBuffer,
        headers: {
          "content-type": "application/octet-stream",
          "content-range": `bytes ${offset}-${offset + chunkBuffer.byteLength - 1}/${file.size}`,
          "x-chunk-sha256": await sha256Hex(chunkBuffer),
        },
      },
      signal,
    );
    onProgress({
      uploadPercent: Math.round(
        (Math.min(offset + chunkBuffer.byteLength, file.size) / file.size) *
          100,
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
        declaredSha256,
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

export type Aspect = "9:16" | "1:1" | "16:9";
export type GenerationConfig = {
  readonly brief: string;
  readonly durationSec: number;
  readonly aspect: Aspect;
  readonly attachmentIds: readonly string[];
};

export async function createCompilerJob(
  media: AcceptedMedia,
  options: {
    readonly startFrame?: number;
    readonly prompt?: string;
    readonly generation?: GenerationConfig;
  },
  signal: AbortSignal,
): Promise<string> {
  const idempotencyKey =
    options.startFrame !== undefined
      ? `job:${media.uploadId}:${options.startFrame}`
      : `job:${media.uploadId}:${requestId()}`;
  const body = await request(
    "/api/v1/jobs",
    {
      method: "POST",
      body: JSON.stringify({
        uploadId: media.uploadId,
        sourceFps: media.fps,
        outputProfile: "vertical-1080p30",
        ...(options.startFrame !== undefined
          ? { startFrame: options.startFrame }
          : {}),
        ...(options.prompt ? { prompt: options.prompt } : {}),
        ...(options.generation ? { generation: options.generation } : {}),
      }),
      headers: {
        ...commandHeaders(idempotencyKey),
      },
    },
    signal,
  );
  const jobId = text(body.id).trim();
  if (!jobId) throw new Error("NETWORK_INTERRUPTED");
  return jobId;
}

// Brand attachments (logos, fonts, brand video) a generation brief will
// reference by id. These upload to the shared attachment store *before* the
// job exists -- unlike uploadJobAttachment below, which attaches a file to
// an already-created job.
export async function uploadAttachment(
  file: File,
  signal: AbortSignal,
): Promise<string> {
  const buffer = await file.arrayBuffer();
  const body = await request(
    "/api/v1/attachments",
    {
      method: "POST",
      body: buffer,
      headers: {
        ...commandHeaders(`attachment:${requestId()}`),
        "content-type": file.type || "application/octet-stream",
        // The scene author matches a file to the brief by its name, so
        // the name has to survive the upload. Percent-encoded because a
        // header is latin-1 and a filename here is routinely Korean.
        "x-filename": encodeURIComponent(file.name),
      },
    },
    signal,
  );
  const attachmentId = text(body.attachmentId).trim();
  if (!attachmentId) throw new Error("NETWORK_INTERRUPTED");
  return attachmentId;
}

export async function uploadJobAttachment(
  jobId: string,
  file: File,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(
    `/api/v1/jobs/${encodeURIComponent(jobId)}/attachments`,
    {
      method: "POST",
      credentials: "include",
      signal,
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-filename": encodeURIComponent(file.name),
      },
      body: file,
    },
  );
  if (!response.ok) throw new Error("NETWORK_INTERRUPTED");
}
