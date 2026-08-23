import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { basename, resolve } from "node:path"

const workspace = resolve(import.meta.dirname, "../..")
const output = resolve(workspace, ".rvs-cache/debian")
const manifestPath = resolve(workspace, "runtime/debian-snapshot-manifest.json")
const nodeImage = "node@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848"
const directPackages = [
  "build-essential",
  "ca-certificates",
  "libasound2",
  "libatk-bridge2.0-0",
  "libatk1.0-0",
  "libcups2",
  "libdbus-1-3",
  "libdrm2",
  "libfreetype6-dev",
  "libgbm1",
  "libglib2.0-0",
  "libgtk-3-0",
  "libharfbuzz-dev",
  "libnspr4",
  "libnss3",
  "libpango-1.0-0",
  "libx11-6",
  "libxcb1",
  "libxcomposite1",
  "libxdamage1",
  "libxext6",
  "libxfixes3",
  "libxkbcommon0",
  "libxrandr2",
  "nasm",
  "pkg-config",
  "xz-utils",
]

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function field(file, name) {
  return execFileSync("dpkg-deb", ["--field", file, name], { encoding: "utf8" }).trim()
}

await mkdir(output, { recursive: true })
const existing = await readdir(output)
if (existing.some((name) => name.endsWith(".deb"))) {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"))
    if (
      manifest.schemaVersion === "rvs-debian-snapshot-v1" &&
      manifest.packages.length > 0 &&
      manifest.packages.every((entry) => entry.url !== null && entry.aptDigest !== null)
    ) {
      process.stdout.write(`${JSON.stringify({ status: "debian-closure-reused", packages: manifest.packages.length })}\n`)
      process.exit(0)
    }
  } catch (error) {
    if (!(error instanceof SyntaxError) && error?.code !== "ENOENT") throw error
  }
}

const shell = [
  "set -eu",
  "apt-get update",
  `apt-get --print-uris --yes --reinstall install ${directPackages.join(" ")} > /out/uris.txt`,
  `apt-get --download-only --yes --reinstall -o Dir::Cache::archives=/out install ${directPackages.join(" ")}`,
].join("; ")
execFileSync("docker", ["run", "--rm", "-v", `${output}:/out`, nodeImage, "bash", "-c", shell], {
  cwd: workspace,
  stdio: "inherit",
})

const uriText = await readFile(resolve(output, "uris.txt"), "utf8")
const urls = new Map(
  [...uriText.matchAll(/^'([^']+\.deb)'\s+([^\s]+\.deb)\s+\d+(?:\s+((?:SHA256|SHA512|MD5Sum):[a-f0-9]+))?\s*$/gm)].map(
    (match) => [match[2], { url: match[1], aptDigest: match[3] ?? "not-provided" }],
  ),
)
const packages = []
for (const name of (await readdir(output)).filter((entry) => entry.endsWith(".deb")).sort()) {
  const path = resolve(output, name)
  const bytes = await readFile(path)
  const uri = urls.get(name)
  packages.push({
    name: field(path, "Package"),
    version: field(path, "Version"),
    architecture: field(path, "Architecture"),
    url: uri?.url ?? null,
    sha256: sha256(bytes),
    aptDigest: uri?.aptDigest ?? null,
    license: `embedded:/usr/share/doc/${field(path, "Package")}/copyright`,
    localPath: `.rvs-cache/debian/${basename(path)}`,
  })
}
const snapshotDigest = sha256(JSON.stringify({ nodeImage, packages }))
if (packages.some((entry) => entry.url === null || entry.aptDigest === null)) {
  throw new Error("SUPPLY_PIN_UNAVAILABLE Debian package URL or APT digest missing")
}
await writeFile(
  manifestPath,
  `${JSON.stringify({ schemaVersion: "rvs-debian-snapshot-v1", nodeImage, directPackages, snapshotDigest, packages }, null, 2)}\n`,
)
await writeFile(resolve(workspace, "runtime/debian-packages.lock"), `${packages.map((entry) => `${entry.name}=${entry.version}`).join("\n")}\n`)
process.stdout.write(`${JSON.stringify({ status: "debian-closure-resolved", packages: packages.length, snapshotDigest })}\n`)
