import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const workspace = resolve(import.meta.dirname, "../..")
const parentPath = ".omo/drafts/reference-video-studio-saas-authority-root.md"
const childPath = ".omo/drafts/reference-video-studio-saas-child-root-todo1.md"
const expectedParent = process.env.RVS_AUTHORITY_ROOT_SHA256
if (expectedParent === undefined) throw new Error("RVS_AUTHORITY_ROOT_SHA256 is required")

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

const parentBytes = await readFile(resolve(workspace, parentPath))
const parentRootSha256 = sha256(parentBytes)
if (parentRootSha256 !== expectedParent) throw new Error("AUTHORITY_ROOT_DRIFT parent root digest mismatch")

const extensions = [
  ["pnpm-lock.yaml", "npm-lock"],
  ["compiler/uv.lock", "python-lock"],
  ["runtime/npm-artifact-manifest.json", "npm-closure"],
  ["runtime/python-wheel-manifest.json", "python-closure"],
  ["runtime/debian-snapshot-manifest.json", "debian-closure"],
  ["runtime/debian-packages.lock", "debian-version-lock"],
  ["runtime/container-child-digest-manifest.json", "container-closure"],
  ["runtime/ffmpeg-build-manifest.json", "ffmpeg-build-closure"],
  ["runtime/x264-build-manifest.json", "x264-build-closure"],
  ["runtime/supply-closure-manifest.json", "supply-artifact-closure"],
  ["runtime/runtime-artifact-manifest.json", "runtime-binary-closure"],
  ["verification/contract/fixture-manifest.lock.json", "fixture-manifest-lock"],
]
const entries = []
for (const [path, role] of extensions) {
  const bytes = await readFile(resolve(workspace, path))
  entries.push({ path, bytes: bytes.byteLength, sha256: sha256(bytes), role })
}

const manifest = {
  schemaVersion: "rvs-authority-child-root-v1",
  phase: "todo1-runtime-authority",
  generatedAt: "2026-08-21",
  parent: { path: parentPath, parentRootSha256 },
  allowedExtensions: ["todo1-dependency-closures", "todo1-fixture-manifest-lock"],
  entries,
}
const markdown = [
  "# Reference Video Studio SaaS Todo 1 child authority root",
  "",
  "This append-only child binds the Todo 1 dependency/runtime closures and independently reproduced fixture lock to the externally anchored parent root.",
  "",
  "```json",
  JSON.stringify(manifest, null, 2),
  "```",
  "",
].join("\n")
await writeFile(resolve(workspace, childPath), markdown)
process.stdout.write(
  `${JSON.stringify({ status: "child-root-emitted", path: childPath, parentRootSha256, childRootSha256: sha256(markdown), entries: entries.length })}\n`,
)
