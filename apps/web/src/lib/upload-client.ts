export type UploadProgress = {
  readonly uploadPercent: number;
  readonly validationPercent: number;
};
export type AcceptedMedia = {
  readonly uploadId: string;
  readonly fps: number;
  readonly frameCount: number;
  readonly durationSeconds: number;
  readonly normalizedDigest: string;
};

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
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof body.code === "string"
        ? body.code
        : text(record(body.error).code) || "NETWORK_INTERRUPTED",
    );
  return body;
};
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
        filename: file.name,
        contentType: "video/mp4",
        sizeBytes: file.size,
      }),
      headers: { "idempotency-key": crypto.randomUUID() },
    },
    signal,
  );
  const uploadId = text(record(created.upload).id);
  if (!uploadId) throw new Error("NETWORK_INTERRUPTED");
  const chunkSize = 8 * 1024 * 1024;
  for (
    let offset = 0, index = 0;
    offset < file.size;
    offset += chunkSize, index += 1
  ) {
    const chunk = await file
      .slice(offset, Math.min(offset + chunkSize, file.size))
      .arrayBuffer();
    await request(
      `/api/v1/uploads/${encodeURIComponent(uploadId)}/chunks`,
      {
        method: "POST",
        body: chunk,
        headers: { "content-type": "application/octet-stream" },
      },
      signal,
    );
    onProgress({
      uploadPercent: Math.round(
        (Math.min(offset + chunk.byteLength, file.size) / file.size) * 100,
      ),
      validationPercent: 0,
    });
  }
  const finalized = await request(
    `/api/v1/uploads/${encodeURIComponent(uploadId)}/finalize`,
    { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } },
    signal,
  );
  const upload = record(finalized.upload);
  onProgress({ uploadPercent: 100, validationPercent: 100 });
  return {
    uploadId,
    fps: Number(finalized.fps ?? 30),
    frameCount: Number(finalized.frameCount ?? 0),
    durationSeconds: Number(finalized.durationSeconds ?? 0),
    normalizedDigest: String(
      finalized.normalizedDigest ?? upload.casObjectId ?? uploadId,
    ),
  };
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
        frameCount: media.frameCount,
        outputProfile: "540x960",
      }),
      headers: {
        "idempotency-key": `job:${media.uploadId}:${startFrame}`,
      },
    },
    signal,
  );
  return String(body.id);
}
