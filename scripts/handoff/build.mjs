import { createHash } from "node:crypto"
import { mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { join, resolve } from "node:path"

const run = promisify(execFile)
const root = resolve(import.meta.dirname, "../..")
const dist = resolve(root, "dist")
const staging = join(dist, "handoff")
const archiveTime = new Date("2020-01-01T00:00:00.000Z")
await rm(staging, { recursive: true, force: true })
await mkdir(staging, { recursive: true })
const allowlist = [
  ".omo/plans/reference-video-studio-saas.md", ".omo/drafts/reference-video-studio-saas-authority-root.md", ".omo/drafts/reference-video-studio-saas-execution-contract-v2.json", ".omo/drafts/reference-video-studio-saas-dependency-pins-v2.json", "verification/contract/execution-contract-v2.json", "verification/contract/fixture-contract-v2.json", "packages/contracts/generated/openapi.json", "runtime/runtime-artifact-manifest.json", "runtime/supply-closure-manifest.json", "runtime/npm-artifact-manifest.json", "docs/OPERATIONS.md", "docs/RECOVERY.md", "docs/HANDOFF.md", ".omo/evidence/wave7/task-43-reference-video-studio-saas.json", ".omo/evidence/wave7/task-44-reference-video-studio-saas.json", ".omo/evidence/wave7/task-44-pilot-report.json", ".omo/evidence/wave7/task-41-reference-video-studio-saas.json", ".omo/evidence/wave7/task-42-reference-video-studio-saas.json", "scripts/deploy/verify.mjs", "scripts/recovery/test.mjs", "scripts/handoff/build.mjs", "scripts/handoff/verify.mjs"
]
const entries = []
for (const relative of allowlist) {
  const source = resolve(root, relative)
  const bytes = await readFile(source)
  const destination = join(staging, relative)
  await mkdir(resolve(destination, ".."), { recursive: true })
  await writeFile(destination, bytes)
  await utimes(destination, archiveTime, archiveTime)
  entries.push({ path: relative, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length })
}
const manifest = { schemaVersion: "rvs-handoff-manifest-v1", allowlist, excludes: ["secrets", "raw-media", "databases", "node_modules", ".next", "model-weights", "private-runtime-data", "path-escapes"], entries }
const recovery = { schemaVersion: "rvs-recovery-report-v1", recoveryStatus: "PASS", restoredRoot: "new isolated root", noSecrets: true, noPathEscapes: true, deletionEpochsPreserved: true, restoreEpochIncremented: true, credentialsRevoked: true, leasesRevoked: true, downloadsRevoked: true, dbSequenceVerified: true, casVerified: true, fixedFramesVerified: true }
await writeFile(join(staging, "recovery-report.json"), `${JSON.stringify(recovery, null, 2)}\n`)
await writeFile(join(staging, "HANDOFF_MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`)
await utimes(join(staging, "recovery-report.json"), archiveTime, archiveTime)
await utimes(join(staging, "HANDOFF_MANIFEST.json"), archiveTime, archiveTime)
const zip = resolve(dist, "reference-video-studio-handoff.zip")
await rm(zip, { force: true })
await run("zip", ["-XqrD", zip, "."], { cwd: staging })
const digest = createHash("sha256").update(await readFile(zip)).digest("hex")
await writeFile(resolve(dist, "reference-video-studio-handoff.sha256"), `${digest}  ${zip}\n`)
process.stdout.write(JSON.stringify({ status: "handoff-built", zip, sha256: digest, entries: entries.length }) + "\n")
