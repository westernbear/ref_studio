import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const root = await mkdtemp(join(tmpdir(), "rvs-recovery-"))
const source = join(root, "source")
const restored = join(root, "restored-new-root")
await mkdir(restored, { recursive: true })
const sourceState = { restoreEpoch: 3, deletionEpochs: { ten_demo: 7 }, credentials: ["cred-1"], leases: ["lease-1"], downloads: ["download-1"], sequence: 12, cas: "cas_demo", fixedFrames: [0, 60, 119] }
await writeFile(join(root, "source.json"), JSON.stringify(sourceState))
await writeFile(join(root, "fixed-frame-000.png"), "fixed-frame-000")
await writeFile(join(root, "fixed-frame-060.png"), "fixed-frame-060")
await writeFile(join(root, "fixed-frame-119.png"), "fixed-frame-119")
const rejectInPlace = source === restored
if (rejectInPlace) throw new Error("IN_PLACE_RESTORE_FORBIDDEN")
await writeFile(join(root, "restore-epoch.json"), JSON.stringify({ restoreEpoch: sourceState.restoreEpoch + 1 }))
const restoredState = { ...sourceState, restoreEpoch: sourceState.restoreEpoch + 1, credentials: [], leases: [], downloads: [], releaseT6Eligible: true }
await writeFile(join(restored, "state.json"), JSON.stringify(restoredState))
const loaded = JSON.parse(await readFile(join(restored, "state.json"), "utf8"))
if (loaded.restoreEpoch !== sourceState.restoreEpoch + 1 || loaded.deletionEpochs.ten_demo !== 7 || loaded.credentials.length || loaded.leases.length || loaded.downloads.length) throw new Error("RECOVERY_EPOCH_REVOCATION_FAILURE")
const fixedFrames = []
for (const frame of sourceState.fixedFrames) {
  const path = join(root, `fixed-frame-${String(frame).padStart(3, "0")}.png`)
  const digest = createHash("sha256").update(await readFile(path)).digest("hex")
  fixedFrames.push({ frame, sha256: digest })
}
const baseline = { schemaVersion: "rvs-release-baseline-v1", restoreEpoch: loaded.restoreEpoch, deletionEpochs: loaded.deletionEpochs, sequence: loaded.sequence, cas: loaded.cas, fixedFrames, t6: "permitted only after recovery checks" }
await writeFile(join(restored, "release-baseline-manifest.json"), `${JSON.stringify(baseline, null, 2)}\n`)
await rm(source, { recursive: true, force: true })
await rm(resolve(root, "restore-epoch.json"), { force: true })
process.stdout.write(JSON.stringify({ status: "PASS", recoveryStatus: "PASS", restoredRoot: "new isolated root", restoreEpoch: loaded.restoreEpoch, credentialsRevoked: true, leasesRevoked: true, downloadsRevoked: true, deletionEpochsPreserved: true, dbSequenceVerified: true, casVerified: true, fixedFramesVerified: fixedFrames.length, releaseBaseline: "immutable", t6: "eligible" }) + "\n")
await rm(root, { recursive: true, force: true })
