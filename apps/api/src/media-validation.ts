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
  maxWidth: 3840,
  maxHeight: 2160,
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
type MediaProbe = z.infer<typeof ProbeSchema>;
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

export class MediaValidationFailure extends Error {
  readonly code:
    | "MEDIA_PARSE_INVALID"
    | "MEDIA_DURATION_INVALID"
    | "MEDIA_FPS_UNSUPPORTED"
    | "MEDIA_VFR_UNSUPPORTED"
    | "MEDIA_DIMENSIONS_INVALID"
    | "MEDIA_CONTAINER_INVALID"
    | "MEDIA_CODEC_INVALID"
    | "MEDIA_METADATA_INVALID";
  constructor(code: MediaValidationFailure["code"]) {
    super(code);
    this.code = code;
  }
}

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
  if (!["mp4", "webm"].includes(probe.container))
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
      // mov/m4a/3gp share ffmpeg's ISO-BMFF demuxer with mp4 and report the
      // same format_name family; matroska covers .webm's container family.
      container: raw.format.format_name.includes("mp4")
        ? "mp4"
        : raw.format.format_name.includes("matroska") ||
            raw.format.format_name.includes("webm")
          ? "webm"
          : "invalid",
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
