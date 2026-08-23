import { createHash } from "node:crypto";
import { z } from "zod";
import type { UploadRecord } from "./uploads.js";

export const MEDIA_LIMITS = {
  minDurationSeconds: 1,
  maxDurationSeconds: 300,
  maxBytes: 2 * 1024 * 1024 * 1024,
  maxWidth: 3840,
  maxHeight: 2160,
  intervalSeconds: 4,
} as const;
export const SANDBOX_POLICY = {
  uid: 65532,
  network: false,
  readOnlyRoot: true,
  tenantStagingMounts: 1,
  noNewPrivileges: true,
  seccomp: true,
  maxPids: 64,
  maxCpuSeconds: 30,
  maxRssBytes: 2 * 1024 * 1024 * 1024,
  maxWallMilliseconds: 120_000,
  maxOutputBytes: 1024 * 1024,
} as const;

const FPS = [24, 25, 30, 50, 60] as const;
const ProbeSchema = z
  .object({
    container: z.string(),
    codec: z.string(),
    durationSeconds: z.number().finite(),
    avgFrameRate: z.number().finite(),
    realFrameRate: z.number().finite(),
    frameCount: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    rotationDegrees: z.union([
      z.literal(0),
      z.literal(90),
      z.literal(180),
      z.literal(270),
    ]),
    hasAudio: z.boolean(),
    metadataSafe: z.boolean(),
  })
  .strict();
export type MediaProbe = z.infer<typeof ProbeSchema>;
export type MediaCommand = {
  readonly executable: "ffprobe" | "ffmpeg";
  readonly args: readonly string[];
  readonly timeoutMilliseconds: number;
  readonly outputCapBytes: number;
};
export type SandboxExecution = {
  readonly policy: typeof SANDBOX_POLICY;
  readonly probe: MediaProbe;
  readonly normalizedSha256: string;
  readonly normalizedBytes: number;
};
export type MediaSandboxRunner = {
  readonly run: (
    commands: readonly MediaCommand[],
    policy: typeof SANDBOX_POLICY,
  ) => Promise<SandboxExecution>;
};
export type NormalizedMedia = {
  readonly sourceCasObjectId: string;
  readonly sourceSha256: string;
  readonly normalizedCasObjectId: string;
  readonly normalizedSha256: string;
  readonly durationSeconds: number;
  readonly fps: (typeof FPS)[number];
  readonly frameCount: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly rotationDegrees: MediaProbe["rotationDegrees"];
  readonly landscapeFit: {
    readonly width: number;
    readonly height: number;
    readonly rotated: boolean;
  };
  readonly audio: {
    readonly sampleRateHz: 48000;
    readonly channels: 2;
    readonly synthesizedSilence: boolean;
  };
  readonly sourceImmutable: true;
  readonly interval: {
    readonly startFrame: number;
    readonly endFrameExclusive: number;
    readonly durationSeconds: 4;
  };
};

export class MediaValidationFailure extends Error {
  readonly code:
    | "MEDIA_PARSE_INVALID"
    | "MEDIA_DURATION_INVALID"
    | "MEDIA_FPS_UNSUPPORTED"
    | "MEDIA_VFR_UNSUPPORTED"
    | "MEDIA_SIZE_LIMIT_EXCEEDED"
    | "MEDIA_DIMENSIONS_INVALID"
    | "MEDIA_CONTAINER_INVALID"
    | "MEDIA_CODEC_INVALID"
    | "MEDIA_METADATA_INVALID"
    | "MEDIA_INTERVAL_INVALID"
    | "MEDIA_SANDBOX_TIMEOUT"
    | "MEDIA_SANDBOX_OUTPUT_LIMIT"
    | "MEDIA_NOT_ACCEPTED";
  constructor(code: MediaValidationFailure["code"]) {
    super(code);
    this.code = code;
  }
}

const command = (
  executable: MediaCommand["executable"],
  args: readonly string[],
): MediaCommand => ({
  executable,
  args,
  timeoutMilliseconds: SANDBOX_POLICY.maxWallMilliseconds,
  outputCapBytes: SANDBOX_POLICY.maxOutputBytes,
});
export const mediaCommands = (stagingName: string): readonly MediaCommand[] => [
  command("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    `staging://${stagingName}`,
  ]),
  command("ffmpeg", [
    "-nostdin",
    "-i",
    `staging://${stagingName}`,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "fps=SOURCE_FPS",
    "-af",
    "aresample=48000, aformat=channel_layouts=stereo",
    "-c:v",
    "libx264",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    "normalized.mp4",
  ]),
];

const fpsValue = (probe: MediaProbe): (typeof FPS)[number] => {
  if (probe.avgFrameRate !== probe.realFrameRate)
    throw new MediaValidationFailure("MEDIA_VFR_UNSUPPORTED");
  const fps = FPS.find((value) => value === probe.avgFrameRate);
  if (fps === undefined)
    throw new MediaValidationFailure("MEDIA_FPS_UNSUPPORTED");
  return fps;
};
export const exactSourceInterval = (
  startFrame: number,
  fps: (typeof FPS)[number],
  frameCount: number,
): {
  readonly startFrame: number;
  readonly endFrameExclusive: number;
  readonly durationSeconds: 4;
} => {
  const length = fps * MEDIA_LIMITS.intervalSeconds;
  if (
    !Number.isInteger(startFrame) ||
    startFrame < 0 ||
    startFrame + length > frameCount
  )
    throw new MediaValidationFailure("MEDIA_INTERVAL_INVALID");
  return {
    startFrame,
    endFrameExclusive: startFrame + length,
    durationSeconds: MEDIA_LIMITS.intervalSeconds,
  };
};

export async function validateAndNormalize(
  upload: UploadRecord,
  sourceSha256: string,
  runner: MediaSandboxRunner,
  intervalStartFrame = 0,
): Promise<NormalizedMedia> {
  if (upload.state !== "ACCEPTED" || upload.casObjectId === null)
    throw new MediaValidationFailure("MEDIA_NOT_ACCEPTED");
  if (upload.sizeBytes > MEDIA_LIMITS.maxBytes)
    throw new MediaValidationFailure("MEDIA_SIZE_LIMIT_EXCEEDED");
  const commands = mediaCommands(upload.id);
  let execution: SandboxExecution;
  try {
    execution = await runner.run(commands, SANDBOX_POLICY);
  } catch (error) {
    if (error instanceof MediaValidationFailure) throw error;
    throw new MediaValidationFailure("MEDIA_SANDBOX_TIMEOUT");
  }
  if (execution.normalizedBytes > SANDBOX_POLICY.maxOutputBytes)
    throw new MediaValidationFailure("MEDIA_SANDBOX_OUTPUT_LIMIT");
  const probeResult = ProbeSchema.safeParse(execution.probe);
  if (!probeResult.success || !probeResult.data.metadataSafe)
    throw new MediaValidationFailure("MEDIA_METADATA_INVALID");
  const probe = probeResult.data;
  if (
    probe.durationSeconds < MEDIA_LIMITS.minDurationSeconds ||
    probe.durationSeconds > MEDIA_LIMITS.maxDurationSeconds
  )
    throw new MediaValidationFailure("MEDIA_DURATION_INVALID");
  if (probe.container !== "mp4")
    throw new MediaValidationFailure("MEDIA_CONTAINER_INVALID");
  if (!["h264", "hevc"].includes(probe.codec))
    throw new MediaValidationFailure("MEDIA_CODEC_INVALID");
  if (
    probe.width > MEDIA_LIMITS.maxWidth ||
    probe.height > MEDIA_LIMITS.maxHeight
  )
    throw new MediaValidationFailure("MEDIA_DIMENSIONS_INVALID");
  const fps = fpsValue(probe);
  const interval = exactSourceInterval(
    intervalStartFrame,
    fps,
    probe.frameCount,
  );
  const normalizedSha256 =
    execution.normalizedSha256 ||
    createHash("sha256")
      .update(`${sourceSha256}:${upload.id}:${fps}:${probe.frameCount}`)
      .digest("hex");
  return {
    sourceCasObjectId: upload.casObjectId,
    sourceSha256,
    normalizedCasObjectId: `norm_${normalizedSha256.slice(0, 24)}`,
    normalizedSha256,
    durationSeconds: probe.durationSeconds,
    fps,
    frameCount: probe.frameCount,
    sourceWidth: probe.width,
    sourceHeight: probe.height,
    rotationDegrees: probe.rotationDegrees,
    landscapeFit: {
      width:
        probe.rotationDegrees === 90 || probe.rotationDegrees === 270
          ? probe.height
          : probe.width,
      height:
        probe.rotationDegrees === 90 || probe.rotationDegrees === 270
          ? probe.width
          : probe.height,
      rotated: probe.rotationDegrees !== 0,
    },
    audio: {
      sampleRateHz: 48000,
      channels: 2,
      synthesizedSilence: !probe.hasAudio,
    },
    sourceImmutable: true,
    interval,
  };
}
