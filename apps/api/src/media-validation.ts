import { createHash } from "node:crypto";
import { execFile, spawnSync } from "node:child_process";
import { chmodSync, chownSync, existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { UploadMedia, UploadRecord } from "./uploads.js";
import { uploadSourcePath } from "./uploads.js";

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
const SDR_PIXEL_FORMATS = ["yuv420p", "yuv422p", "yuv444p"] as const;
const exec = promisify(execFile);
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
const FfprobeSchema = z.object({
  format: z.object({
    duration: z.string(),
    format_name: z.string(),
  }),
  streams: z.array(
    z
      .object({
        codec_type: z.string(),
        codec_name: z.string().optional(),
        pix_fmt: z.string().optional(),
        width: z.number().int().optional(),
        height: z.number().int().optional(),
        avg_frame_rate: z.string().optional(),
        r_frame_rate: z.string().optional(),
        nb_read_frames: z.string().optional(),
        start_time: z.string().optional(),
        color_transfer: z.string().optional(),
        channels: z.number().int().optional(),
        tags: z.object({ rotate: z.string().optional() }).default({}),
      })
      .passthrough(),
  ),
});
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
const fraction = (value: string | undefined): number => {
  const [numerator, denominator] = (value ?? "").split("/").map(Number);
  return numerator && denominator ? numerator / denominator : Number.NaN;
};
export const isSafeColorTransfer = (
  transfer: string | undefined,
  pixelFormat: string | undefined,
): boolean =>
  ["bt709", "iec61966-2-1"].includes(transfer ?? "") ||
  (transfer === undefined &&
    SDR_PIXEL_FORMATS.includes(
      pixelFormat as (typeof SDR_PIXEL_FORMATS)[number],
    ));
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

const validateProbe = (
  value: unknown,
): {
  readonly probe: MediaProbe;
  readonly fps: (typeof FPS)[number];
} => {
  const parsed = ProbeSchema.safeParse(value);
  if (!parsed.success || !parsed.data.metadataSafe)
    throw new MediaValidationFailure("MEDIA_METADATA_INVALID");
  const probe = parsed.data;
  if (
    probe.durationSeconds < MEDIA_LIMITS.minDurationSeconds ||
    probe.durationSeconds > MEDIA_LIMITS.maxDurationSeconds
  )
    throw new MediaValidationFailure("MEDIA_DURATION_INVALID");
  if (probe.container !== "mp4")
    throw new MediaValidationFailure("MEDIA_CONTAINER_INVALID");
  if (!["h264", "hevc", "vp9", "av1"].includes(probe.codec))
    throw new MediaValidationFailure("MEDIA_CODEC_INVALID");
  if (
    Math.max(probe.width, probe.height) > MEDIA_LIMITS.maxWidth ||
    Math.min(probe.width, probe.height) > MEDIA_LIMITS.maxHeight
  )
    throw new MediaValidationFailure("MEDIA_DIMENSIONS_INVALID");
  const fps = fpsValue(probe);
  return { probe, fps };
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
  const { probe, fps } = validateProbe(execution.probe);
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

export async function inspectUploadedMedia(
  upload: UploadRecord,
): Promise<UploadMedia> {
  const durableInput = uploadSourcePath(upload);
  const directory = durableInput
    ? null
    : await mkdtemp(join(tmpdir(), "rvs-upload-probe-"));
  const input = durableInput ?? join(directory ?? "", "source.mp4");
  try {
    if (!durableInput) {
      await writeFile(input, upload.chunks, { mode: 0o600 });
    }
    if (durableInput && process.getuid?.() === 0) {
      chownSync(dirname(input), 65_532, 65_532);
      chmodSync(dirname(input), 0o700);
      chownSync(input, 65_532, 65_532);
      chmodSync(input, 0o400);
    }
    const ffprobe =
      process.env["RVS_FFPROBE_PATH"] ??
      (existsSync("/opt/rvs/bin/ffprobe") ? "/opt/rvs/bin/ffprobe" : "ffprobe");
    const probeArgs = [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-count_frames",
      "-show_entries",
      "format=duration,format_name:stream=codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,nb_read_frames,start_time,color_transfer,channels:stream_tags=rotate",
      "-of",
      "json",
      input,
    ];
    const sandboxed =
      existsSync("/usr/bin/bwrap") &&
      spawnSync(
        "/usr/bin/bwrap",
        [
          "--unshare-net",
          "--unshare-user",
          "--uid",
          "65532",
          "--gid",
          "65532",
          "--die-with-parent",
          "--new-session",
          "--ro-bind",
          "/",
          "/",
          "--dev",
          "/dev",
          "--proc",
          "/proc",
          "/usr/bin/true",
        ],
        { stdio: "ignore" },
      ).status === 0;
    const result = await exec(
      sandboxed ? "/usr/bin/bwrap" : "/usr/bin/setpriv",
      sandboxed
        ? [
            "--unshare-net",
            "--unshare-user",
            "--uid",
            "65532",
            "--gid",
            "65532",
            "--die-with-parent",
            "--new-session",
            "--ro-bind",
            "/",
            "/",
            "--dev",
            "/dev",
            "--proc",
            "/proc",
            ffprobe,
            ...probeArgs,
          ]
        : [
            ...(process.getuid?.() === 0
              ? ["--reuid=65532", "--regid=65532", "--clear-groups"]
              : []),
            "--no-new-privs",
            "--",
            ffprobe,
            ...probeArgs,
          ],
      {
        encoding: "utf8",
        timeout: SANDBOX_POLICY.maxWallMilliseconds,
        maxBuffer: SANDBOX_POLICY.maxOutputBytes,
      },
    );
    const raw = FfprobeSchema.parse(JSON.parse(result.stdout));
    const video = raw.streams.find((stream) => stream.codec_type === "video");
    const audio = raw.streams.find((stream) => stream.codec_type === "audio");
    const rotation = Number(video?.tags.rotate ?? 0);
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const { probe, fps } = validateProbe({
      container: raw.format.format_name.includes("mp4") ? "mp4" : "invalid",
      codec: video?.codec_name ?? "",
      durationSeconds: Number(raw.format.duration),
      avgFrameRate: fraction(video?.avg_frame_rate),
      realFrameRate: fraction(video?.r_frame_rate),
      frameCount: Number(video?.nb_read_frames),
      width: video?.width ?? 0,
      height: video?.height ?? 0,
      rotationDegrees: normalizedRotation,
      hasAudio: Boolean(audio),
      metadataSafe:
        Number(video?.start_time ?? 0) >= 0 &&
        [
          ...SDR_PIXEL_FORMATS,
          "yuv420p10le",
          "yuv422p10le",
          "yuv444p10le",
        ].includes(video?.pix_fmt ?? "") &&
        isSafeColorTransfer(video?.color_transfer, video?.pix_fmt) &&
        (!audio ||
          (audio.channels !== undefined &&
            audio.channels > 0 &&
            audio.channels <= 8)),
    });
    return {
      fps,
      frameCount: probe.frameCount,
      durationSeconds: probe.durationSeconds,
    };
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
  }
}
