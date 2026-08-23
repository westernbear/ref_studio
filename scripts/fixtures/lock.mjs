import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const runtimeImage = "reference-video-studio-runtime:1.0.0";
const ffmpeg = "/opt/rvs/bin/ffmpeg";
const ffprobe = "/opt/rvs/bin/ffprobe";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args) {
  const containerArgs = args.map((argument) =>
    argument.startsWith(workspace)
      ? `/workspace${argument.slice(workspace.length)}`
      : argument,
  );
  return execFileSync(
    "docker",
    [
      "run",
      "--rm",
      "--network",
      "none",
      "--user",
      `${process.getuid()}:${process.getgid()}`,
      "--env",
      "HOME=/tmp",
      "--env",
      "LC_ALL=C.UTF-8",
      "--env",
      "TZ=UTC",
      "--volume",
      `${workspace}:/workspace`,
      "--workdir",
      "/workspace",
      "--entrypoint",
      command,
      runtimeImage,
      ...containerArgs,
    ],
    {
      cwd: workspace,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

async function fileSha256(path) {
  return sha256(await readFile(path));
}

function rawFrameSha256(input, frames) {
  const output = run(ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-i",
    input,
    "-frames:v",
    String(frames),
    "-pix_fmt",
    "rgba",
    "-f",
    "hash",
    "-hash",
    "sha256",
    "-",
  ]);
  const digest = output.match(/SHA256=([a-f0-9]{64})/)?.[1];
  if (digest === undefined)
    throw new Error("fixture raw-frame hash was not emitted");
  return digest;
}

function audioPcmSha256(filtergraph) {
  const output = run(ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-f",
    "lavfi",
    "-i",
    filtergraph,
    "-t",
    "4",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    "-f",
    "hash",
    "-hash",
    "sha256",
    "-",
  ]);
  const digest = output.match(/SHA256=([a-f0-9]{64})/)?.[1];
  if (digest === undefined)
    throw new Error("fixture audio hash was not emitted");
  return digest;
}

async function generateMedia(contract, fixture, filtergraph, root) {
  await mkdir(root, { recursive: true });
  const videoOnly = resolve(root, "video-only.mp4");
  const audio = resolve(root, "audio.wav");
  const source = resolve(root, "source.mp4");
  const normalized = resolve(root, "normalized-working.mkv");
  const filterSource = resolve(root, "filter-source.mkv");

  run(ffmpeg, [
    ...contract.generator.videoArgvPrefix.slice(1),
    filtergraph,
    "-t",
    "4",
    "-c:v",
    "ffv1",
    "-pix_fmt",
    "yuv444p10le",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-an",
    "-y",
    filterSource,
  ]);
  run(ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-i",
    filterSource,
    ...contract.generator.videoOnlyArgvSuffix,
    "-threads",
    "1",
    "-y",
    videoOnly,
  ]);
  run(ffmpeg, [
    ...contract.generator.audioArgvPrefix.slice(1),
    fixture.audioFiltergraph,
    ...contract.generator.audioArgvSuffix,
    "-y",
    audio,
  ]);
  run(ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-i",
    videoOnly,
    "-i",
    audio,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-movflags",
    "+faststart",
    "-y",
    source,
  ]);
  run(ffmpeg, [
    "-hide_banner",
    "-nostdin",
    "-i",
    source,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-vf",
    `colorspace=all=bt709:iall=bt709:fast=0,fps=${fixture.fps}`,
    "-af",
    "aresample=48000",
    "-c:v",
    "ffv1",
    "-pix_fmt",
    "yuv444p10le",
    "-c:a",
    "pcm_s16le",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    "-y",
    normalized,
  ]);
  const probe = run(ffprobe, [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size,format_name:stream=index,codec_type,codec_name,pix_fmt,width,height,avg_frame_rate,r_frame_rate,time_base,start_time,duration,field_order,color_space,color_transfer,color_primaries,channels,channel_layout,sample_rate:stream_tags=rotate",
    "-of",
    "json",
    source,
  ]);
  return {
    rawFrameSha256: rawFrameSha256(filterSource, fixture.frames),
    audioPcmSha256: audioPcmSha256(fixture.audioFiltergraph),
    videoOnlySha256: await fileSha256(videoOnly),
    sourceMp4Sha256: await fileSha256(source),
    normalizedWorkingSha256: await fileSha256(normalized),
    ffprobeSha256: sha256(probe),
  };
}

async function generatePass(contract, root, generatorClosureSha256) {
  const entries = [];
  for (const fixture of contract.fixtures) {
    const fixtureRoot = resolve(root, fixture.id);
    const media = await generateMedia(
      contract,
      fixture,
      fixture.videoFiltergraph,
      fixtureRoot,
    );
    const variants = {};
    for (const [name, filtergraph] of Object.entries(
      fixture.variantFiltergraphs ?? {},
    )) {
      const variantMedia = await generateMedia(
        contract,
        fixture,
        filtergraph,
        resolve(fixtureRoot, "variants", name),
      );
      variants[name] = {
        variantFiltergraphSha256: sha256(filtergraph),
        variantTruthSha256: sha256(
          JSON.stringify(fixture.truth.variants[name]),
        ),
        variantRawFrameSha256: variantMedia.rawFrameSha256,
        variantVideoOnlySha256: variantMedia.videoOnlySha256,
        variantSourceMp4Sha256: variantMedia.sourceMp4Sha256,
        variantNormalizedWorkingSha256: variantMedia.normalizedWorkingSha256,
        variantFfprobeSha256: variantMedia.ffprobeSha256,
      };
    }
    if (Object.keys(variants).length > 0) {
      await writeFile(
        resolve(fixtureRoot, "variants", "manifest.json"),
        `${JSON.stringify({ id: fixture.id, variants }, null, 2)}\n`,
      );
    }
    entries.push({
      id: fixture.id,
      fps: fixture.fps,
      frames: fixture.frames,
      size: fixture.size,
      videoFiltergraphSha256: sha256(fixture.videoFiltergraph),
      audioFiltergraphSha256: sha256(fixture.audioFiltergraph),
      ...media,
      truthSha256: sha256(JSON.stringify(fixture.truth)),
      generatorClosureSha256,
      variants,
    });
    process.stdout.write(
      `${JSON.stringify({ status: "fixture-generated", id: fixture.id })}\n`,
    );
  }
  return entries;
}

const contractArgument = option("--contract");
if (contractArgument === undefined) throw new Error("--contract is required");
const lockArgument =
  option("--lock") ?? "verification/contract/fixture-manifest.lock.json";
const noWriteLock =
  process.argv.includes("--no-write-lock") ||
  process.argv.includes("--verify-lock");
const contractBytes = await readFile(resolve(workspace, contractArgument));
const contract = JSON.parse(contractBytes.toString("utf8"));
if (contract.schemaVersion !== "rvs-fixture-contract-v2")
  throw new Error("invalid fixture contract schema");
if (!Array.isArray(contract.fixtures) || contract.fixtures.length !== 16)
  throw new Error("FIXTURE_COUNT_MISMATCH expected 16 fixtures");
if (new Set(contract.fixtures.map((fixture) => fixture.id)).size !== 16)
  throw new Error("FIXTURE_ID_DUPLICATE");

const version = run(ffmpeg, ["-version"]);
if (
  !version.startsWith("ffmpeg version 8.0.1") ||
  !version.includes("--enable-gpl") ||
  !version.includes("--enable-libx264")
) {
  throw new Error(
    "SUPPLY_PIN_UNAVAILABLE pinned GPL FFmpeg 8.0.1 with x264 is required",
  );
}
const closureParts = await Promise.all([
  readFile(resolve(workspace, "runtime/runtime-artifact-manifest.json")),
  readFile(resolve(workspace, "runtime/ffmpeg-build-manifest.json")),
  readFile(resolve(workspace, "runtime/x264-build-manifest.json")),
  readFile(resolve(workspace, "runtime/debian-snapshot-manifest.json")),
  readFile(
    resolve(workspace, "verification/contract/fonts/WantedSansVariable.ttf"),
  ),
  readFile(resolve(workspace, "verification/contract/fonts/Inter.ttf")),
  contractBytes,
]);
const generatorClosureSha256 = sha256(Buffer.concat(closureParts));
const passOneRoot = resolve(workspace, "verification/contract/fixtures");
const passTwoRoot = resolve(
  workspace,
  `.rvs-cache/fixture-pass-${process.pid}`,
);
const passOne = await generatePass(
  contract,
  passOneRoot,
  generatorClosureSha256,
);
const passTwo = await generatePass(
  contract,
  passTwoRoot,
  generatorClosureSha256,
);
const passOneSha256 = sha256(JSON.stringify(passOne));
const passTwoSha256 = sha256(JSON.stringify(passTwo));
if (passOneSha256 !== passTwoSha256)
  throw new Error("FIXTURE_NONDETERMINISTIC two generation passes differ");

const lock = {
  schemaVersion: "rvs-fixture-manifest-lock-v1",
  contractSha256: sha256(contractBytes),
  generatorClosureSha256,
  generationPasses: [passOneSha256, passTwoSha256],
  fixtures: passOne,
};
const lockPath = resolve(workspace, lockArgument);
if (noWriteLock) {
  const existing = JSON.parse(await readFile(lockPath, "utf8"));
  if (JSON.stringify(existing) !== JSON.stringify(lock))
    throw new Error("FIXTURE_LOCK_MISMATCH");
  process.stdout.write(
    `${JSON.stringify({ status: "fixtures-verified", fixtures: passOne.length, passSha256: passOneSha256, lock: lockArgument })}\n`,
  );
} else {
  await writeFile(
    resolve(workspace, contract.fixtureLock.path),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify({ status: "locked", fixtures: passOne.length, passSha256: passOneSha256 })}\n`,
  );
}
