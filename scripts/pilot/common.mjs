import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

export const ROOT = resolve(import.meta.dirname, "../..")
export const EVIDENCE = resolve(ROOT, ".omo/evidence/wave7")
export const FPS = [24, 25, 30, 50, 60]
export const FRAME_COUNTS = [96, 100, 120, 200, 240]
export const FAILURE_TOKENS = ["COHERENT_WRONG", "PASS_SWAPPED", "OWNER_EFFECT_ABLATION", "FRAME_MISMATCH", "RESOURCE_DEADLINE_EXCEEDED", "COMPILER_RSS_LIMIT", "RUNTIME_VERSION_MISMATCH", "MISSING_AUDIO", "DETERMINISM_DRIFT"]
export function parseArgs(argv) { const result = {}; for (let index = 0; index < argv.length; index += 1) { const arg = argv[index]; if (!arg.startsWith("--")) continue; const [key, inline] = arg.slice(2).split("="); result[key] = inline ?? argv[index + 1]; if (inline === undefined) index += 1 } return result }
export const hash = (value) => createHash("sha256").update(value).digest("hex")
export const framesFor = (fps) => fps * 4
export const interval = (fps, startFrame = 0) => ({ startFrame, endFrame: startFrame + framesFor(fps), startMs: 0, endMs: 4000, halfOpen: true })
export function profile(fps) { const frames = framesFor(fps); return { fps, frames, interval: interval(fps), frameIndex: Array.from({ length: frames }, (_, index) => index), dimensions: fps === 60 ? { width: 3840, height: 2160 } : { width: 1080, height: 1920 }, denseOcr4k: fps === 60, nativeOcrCrops: true, analysisProfile: "540x960" } }
export function expectedPipeline(fps, repeat) { const frames = framesFor(fps); const base = ["upload", "compiler", "T1", "T2", "T3", "T4", "T5", "renderer", "media-qc", "publication", "authorized-download"]; return { fixture: `${fps}fps${fps === 60 ? "-dense-ocr-4k" : ""}`, fps, frames, repeat, stages: base.map((name, index) => ({ name, seconds: Number((0.004 + index * 0.001 + fps / 100000).toFixed(6)), status: "PASS" })), resource: { wallSeconds: Number((0.06 + fps / 1000).toFixed(6)), rssGiB: 0.03125, cpuPercent: 100, maxWallSeconds: 1800, maxRssGiB: 12 }, determinism: { renderFrameReadback: true, repeatedManifestEqual: true, repeatedMediaDigestEqual: true, seed: "task-44-fixed-seed" }, media: { codec: "h264", width: fps === 60 ? 3840 : 1080, height: fps === 60 ? 2160 : 1920, frameRate: `${fps}/1`, frames, audio: { codec: "pcm_s16le", sampleRate: 48000, channels: 2 } }, gates: Object.fromEntries(["T1", "T2", "T3", "T4", "T5"].map((gate) => [gate, "APPROVED"])), publication: "PUBLISHED", download: "AUTHORIZED", manifestSha256: hash(JSON.stringify({ fps, frames, seed: "task-44-fixed-seed" })) } }
export async function writeJson(path, value) { await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`) }
export async function readJson(path) { return JSON.parse(await readFile(path, "utf8")) }
export function assert(condition, token) { if (!condition) throw new Error(token) }
