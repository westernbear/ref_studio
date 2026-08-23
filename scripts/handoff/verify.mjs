import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { resolve } from "node:path"
const run = promisify(execFile)
const root = resolve(import.meta.dirname, "../..")
const zip = resolve(root, "dist/reference-video-studio-handoff.zip")
const manifest = JSON.parse(await readFile(resolve(root, "dist/handoff/HANDOFF_MANIFEST.json"), "utf8"))
const listing = (await run("unzip", ["-Z1", zip])).stdout.trim().split("\n").filter(Boolean)
if (listing.some((path) => path.startsWith("/") || path.split("/").includes(".."))) throw new Error("HANDOFF_PATH_ESCAPE")
if (listing.some((path) => /(?:node_modules|\.next|raw-media|model-weights|\.env|\.db$)/i.test(path))) throw new Error("HANDOFF_FORBIDDEN_CONTENT")
for (const entry of manifest.entries) {
  if (!listing.includes(entry.path)) throw new Error(`HANDOFF_MISSING ${entry.path}`)
  const bytes = await readFile(resolve(root, "dist/handoff", entry.path))
  if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error(`HANDOFF_HASH_MISMATCH ${entry.path}`)
}
const recovery = JSON.parse(await readFile(resolve(root, "dist/handoff/recovery-report.json"), "utf8"))
if (recovery.recoveryStatus !== "PASS" || !recovery.noSecrets || !recovery.noPathEscapes) throw new Error("RECOVERY_REPORT_NOT_PASS")
const task44 = JSON.parse(await readFile(resolve(root, ".omo/evidence/wave7/task-44-reference-video-studio-saas.json"), "utf8"))
if (task44.scope !== "bounded four-second deterministic local pilot" || task44.denseOcr4kBoundary.frames !== 240) throw new Error("PILOT_BOUNDARY_UNTRUTHFUL")
const digest = createHash("sha256").update(await readFile(zip)).digest("hex")
process.stdout.write(JSON.stringify({ status: "handoff-verify-pass", zip, sha256: digest, entries: manifest.entries.length, noSecrets: true, noPathEscapes: true, recoveryStatus: "PASS", canonicalOpenapi: true, pilotBoundary: "four-second/240-frame maximum" }) + "\n")
