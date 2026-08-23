import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

const workspace = resolve(import.meta.dirname, "../..")
const pinsPath = resolve(workspace, ".omo/drafts/reference-video-studio-saas-dependency-pins-v2.json")
const supplyPath = resolve(workspace, ".omo/drafts/reference-video-studio-saas-supply-chain.json")
const pythonRoot = resolve(workspace, ".rvs-cache/python-3.12.14")
const pythonPath = resolve(pythonRoot, "bin/python3.12")

function run(command, args) {
  return execFileSync(command, args, {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      UV_PROJECT_ENVIRONMENT: resolve(workspace, "compiler/.venv"),
      UV_PYTHON: pythonPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex")
}

function parsePnpmPackages(lockText) {
  const packages = []
  let inPackages = false
  let current
  for (const line of lockText.split("\n")) {
    if (line === "packages:") {
      inPackages = true
      continue
    }
    if (line === "snapshots:") break
    if (!inPackages) continue
    const packageMatch = line.match(/^  ['"]?([^\s].+?@[^:'"]+)['"]?:$/)
    if (packageMatch?.[1] !== undefined) {
      const key = packageMatch[1].replace(/\(.+$/, "")
      const separator = key.lastIndexOf("@")
      if (separator <= 0) throw new Error(`SUPPLY_PIN_UNAVAILABLE invalid pnpm key ${key}`)
      current = {
        name: key.slice(0, separator),
        version: key.slice(separator + 1),
        integrity: null,
        platformMarkers: [],
      }
      packages.push(current)
      continue
    }
    if (current === undefined) continue
    const integrityMatch = line.match(/integrity:\s*([^,}\s]+)/)
    if (integrityMatch?.[1] !== undefined) current.integrity = integrityMatch[1]
    if (/^    (cpu|os|libc|engines):/.test(line)) current.platformMarkers.push(line.trim())
  }
  return packages.map((entry) => {
    const basename = entry.name.includes("/") ? entry.name.slice(entry.name.lastIndexOf("/") + 1) : entry.name
    return {
      ...entry,
      url: `https://registry.npmjs.org/${entry.name}/-/${basename}-${entry.version}.tgz`,
      license: null,
    }
  })
}

function parseUvPackages(lockText) {
  const packages = []
  for (const block of lockText.split("[[package]]").slice(1)) {
    const name = block.match(/^name = "([^"]+)"/m)?.[1]
    const version = block.match(/^version = "([^"]+)"/m)?.[1]
    if (name === undefined || version === undefined) continue
    const artifacts = [...block.matchAll(/\{ url = "([^"]+)", hash = "sha256:([a-f0-9]{64})"[^}]*\}/g)].map(
      (match) => ({ url: match[1], sha256: match[2] }),
    )
    const marker = block.match(/^marker = "([^"]+)"/m)?.[1] ?? null
    packages.push({ name, version, artifacts, license: null, platformMarker: marker })
  }
  return packages
}

const pins = JSON.parse(await readFile(pinsPath, "utf8"))
const supply = JSON.parse(await readFile(supplyPath, "utf8"))
if (pins.schemaVersion !== "rvs-dependency-pins-v2") {
  throw new Error("SUPPLY_PIN_UNAVAILABLE invalid dependency pin schema")
}
if (run("pnpm", ["--version"]) !== "11.20.0" || !run("uv", ["--version"]).startsWith("uv 0.11.8 ")) {
  throw new Error("SUPPLY_PIN_UNAVAILABLE pinned pnpm 11.20.0 and uv 0.11.8 are required")
}
if (!existsSync(pythonPath)) {
  const pythonImage = supply.artifacts.find((artifact) => artifact.name === "python-image")
  if (pythonImage?.digest === undefined) {
    throw new Error("SUPPLY_PIN_UNAVAILABLE pinned Python image digest is missing")
  }
  const image = `python@${pythonImage.digest}`
  run("docker", ["pull", image])
  const containerId = run("docker", ["create", image])
  await mkdir(pythonRoot, { recursive: true })
  try {
    run("docker", ["cp", `${containerId}:/usr/local/.`, `${pythonRoot}/`])
  } finally {
    run("docker", ["rm", containerId])
  }
}

run("pnpm", ["install", "--lockfile-only"])
run("uv", ["lock", "--project", "compiler"])
run("node", ["scripts/supply/resolve-debian.mjs"])
run("node", ["scripts/supply/bundle-debian.mjs"])

const pnpmLock = await readFile(resolve(workspace, "pnpm-lock.yaml"), "utf8")
const uvLock = await readFile(resolve(workspace, "compiler/uv.lock"), "utf8")
const npmPackages = parsePnpmPackages(pnpmLock)
const pythonPackages = parseUvPackages(uvLock)
if (npmPackages.length === 0 || pythonPackages.length === 0) {
  throw new Error("SUPPLY_PIN_UNAVAILABLE dependency closure is empty")
}

await writeFile(
  resolve(workspace, "runtime/npm-artifact-manifest.json"),
  `${JSON.stringify({ schemaVersion: "rvs-npm-closure-v1", lockSha256: sha256(pnpmLock), packages: npmPackages }, null, 2)}\n`,
)
await writeFile(
  resolve(workspace, "runtime/python-wheel-manifest.json"),
  `${JSON.stringify({ schemaVersion: "rvs-python-closure-v1", lockSha256: sha256(uvLock), packages: pythonPackages }, null, 2)}\n`,
)

process.stdout.write(
  `${JSON.stringify({ status: "resolved", npmPackages: npmPackages.length, pythonPackages: pythonPackages.length, pnpmLockSha256: sha256(pnpmLock), uvLockSha256: sha256(uvLock) })}\n`,
)
