import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { basename, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const artifactCacheRoot = resolve(workspace, ".rvs-cache/artifacts");
const pythonPath = resolve(
  workspace,
  ".rvs-cache/python-3.12.14/bin/python3.12",
);
const venvPythonPath = resolve(workspace, "compiler/.venv/bin/python");
const supplyPath = resolve(
  workspace,
  ".omo/drafts/reference-video-studio-saas-supply-chain.json",
);

function run(command, args) {
  return execFileSync(command, args, {
    cwd: workspace,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "true",
      UV_PROJECT_ENVIRONMENT: resolve(workspace, "compiler/.venv"),
      UV_PYTHON: pythonPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function download(artifact) {
  if (artifact.digest !== undefined)
    return { ...artifact, localPath: null, verified: "oci-digest" };
  const integrity =
    artifact.sha256 === undefined
      ? artifact.integrity?.match(/^(sha512)-(.+)$/)
      : undefined;
  const algorithm = artifact.sha256 === undefined ? integrity?.[1] : "sha256";
  const expected =
    artifact.sha256 ??
    (integrity?.[2] === undefined
      ? undefined
      : Buffer.from(integrity[2], "base64").toString("hex"));
  if (algorithm === undefined || expected === undefined) {
    throw new Error(
      `SUPPLY_PIN_UNAVAILABLE ${artifact.name} has no supported integrity`,
    );
  }
  const targetRoot = resolve(artifactCacheRoot, algorithm);
  await mkdir(targetRoot, { recursive: true });
  const target = resolve(targetRoot, expected);
  try {
    const bytes = await readFile(target);
    if (createHash(algorithm).update(bytes).digest("hex") !== expected)
      throw new Error(`cached digest mismatch ${artifact.name}`);
    return {
      ...artifact,
      localPath: target.slice(workspace.length + 1),
      verified: algorithm,
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("ENOENT"))
      throw error;
  }

  const response = await fetch(artifact.url, {
    headers: { "user-agent": "reference-video-studio-supply-bootstrap/1" },
    signal: AbortSignal.timeout(1_800_000),
  });
  if (!response.ok) {
    throw new Error(
      `SUPPLY_PIN_UNAVAILABLE ${artifact.name} HTTP ${response.status} ${artifact.url}`,
    );
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash(algorithm).update(bytes).digest("hex");
  if (actual !== expected) {
    throw new Error(
      `SUPPLY_PIN_UNAVAILABLE ${artifact.name} ${algorithm}=${actual} expected=${expected}`,
    );
  }
  const temporary = `${target}.partial-${process.pid}`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
  return {
    ...artifact,
    localPath: target.slice(workspace.length + 1),
    verified: algorithm,
  };
}

async function findFile(root, names) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFile(path, names);
      if (nested !== undefined) return nested;
    } else if (names.includes(entry.name)) {
      return path;
    }
  }
  return undefined;
}

function packageLicenses(raw) {
  const licenses = new Map();
  for (const [license, packages] of Object.entries(raw)) {
    if (!Array.isArray(packages)) continue;
    for (const entry of packages) {
      if (typeof entry.name !== "string" || !Array.isArray(entry.versions))
        continue;
      for (const version of entry.versions) {
        if (typeof version === "string")
          licenses.set(`${entry.name}@${version}`, license);
      }
    }
  }
  return licenses;
}

function licenseText(value) {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (
    value !== null &&
    typeof value === "object" &&
    typeof value.type === "string"
  )
    return value.type;
  return undefined;
}

async function mapConcurrent(entries, limit, callback) {
  const output = new Array(entries.length);
  let index = 0;
  async function worker() {
    while (index < entries.length) {
      const current = index;
      index += 1;
      output[current] = await callback(entries[current]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, entries.length) }, worker),
  );
  return output;
}

async function fetchMetadata(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "reference-video-studio-supply-bootstrap/1" },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `SUPPLY_PIN_UNAVAILABLE license metadata HTTP ${response.status} ${url}`,
    );
  return response.json();
}

async function npmRegistryLicense(entry) {
  const metadata = await fetchMetadata(
    `https://registry.npmjs.org/${entry.name.replace("/", "%2f")}/${entry.version}`,
  );
  const direct = licenseText(metadata.license);
  if (direct !== undefined) return direct;
  if (Array.isArray(metadata.licenses)) {
    const values = metadata.licenses
      .map(licenseText)
      .filter((value) => value !== undefined);
    if (values.length > 0) return values.join(" OR ");
  }
  throw new Error(
    `SUPPLY_PIN_UNAVAILABLE npm license missing ${entry.name}@${entry.version}`,
  );
}

async function pythonRegistryLicense(entry) {
  if (entry.name === "rvs-compiler") return "LicenseRef-Proprietary";
  const registryVersion = entry.version.replace(/\+cpu$/, "");
  const metadata = await fetchMetadata(
    `https://pypi.org/pypi/${encodeURIComponent(entry.name)}/${encodeURIComponent(registryVersion)}/json`,
  );
  const expression = licenseText(metadata.info?.license_expression);
  if (expression !== undefined) return expression;
  const direct = licenseText(metadata.info?.license);
  if (direct !== undefined && direct !== "UNKNOWN") return direct;
  const classifiers = Array.isArray(metadata.info?.classifiers)
    ? metadata.info.classifiers.filter((value) =>
        value.startsWith("License :: "),
      )
    : [];
  if (classifiers.length > 0) return classifiers.join("; ");
  const licenseFiles = Array.isArray(metadata.info?.license_files)
    ? metadata.info.license_files.filter(
        (value) => typeof value === "string" && value !== "",
      )
    : [];
  if (licenseFiles.length > 0) return `embedded:${licenseFiles.join(",")}`;
  throw new Error(
    `SUPPLY_PIN_UNAVAILABLE Python license missing ${entry.name}@${entry.version}`,
  );
}

await mkdir(artifactCacheRoot, { recursive: true });
const supply = JSON.parse(await readFile(supplyPath, "utf8"));
if (supply.schemaVersion !== "rvs-supply-chain-lock-v2") {
  throw new Error("SUPPLY_PIN_UNAVAILABLE invalid supply-chain schema");
}

const hydrated = [];
for (const artifact of supply.artifacts)
  hydrated.push(await download(artifact));

for (const artifact of hydrated.filter((entry) => entry.digest !== undefined)) {
  const image = `${artifact.name === "node-image" ? "node" : "python"}@${artifact.digest}`;
  run("docker", ["pull", image]);
}

run("pnpm", ["fetch", "--frozen-lockfile"]);
run("pnpm", ["install", "--frozen-lockfile", "--offline"]);
run("uv", ["sync", "--project", "compiler"]);
run("uv", ["sync", "--frozen", "--offline", "--project", "compiler"]);

const npmManifestPath = resolve(
  workspace,
  "runtime/npm-artifact-manifest.json",
);
const npmManifest = JSON.parse(await readFile(npmManifestPath, "utf8"));
const npmLicenses = packageLicenses(
  JSON.parse(run("pnpm", ["licenses", "list", "--json", "--long"])),
);
npmManifest.packages = await mapConcurrent(
  npmManifest.packages,
  12,
  async (entry) => ({
    ...entry,
    license:
      npmLicenses.get(`${entry.name}@${entry.version}`) ??
      (await npmRegistryLicense(entry)),
  }),
);
await writeFile(npmManifestPath, `${JSON.stringify(npmManifest, null, 2)}\n`);

const pythonManifestPath = resolve(
  workspace,
  "runtime/python-wheel-manifest.json",
);
const pythonManifest = JSON.parse(await readFile(pythonManifestPath, "utf8"));
const pythonLicenseScript = [
  "import importlib.metadata as m,json",
  "print(json.dumps({d.metadata['Name'].lower()+'@'+d.version: (d.metadata.get('License-Expression') or d.metadata.get('License') or (('embedded:'+','.join(d.metadata.get_all('License-File') or [])) if d.metadata.get_all('License-File') else 'UNKNOWN')) for d in m.distributions()}))",
].join(";");
const pythonLicenses = JSON.parse(
  run(venvPythonPath, ["-c", pythonLicenseScript]),
);
pythonManifest.packages = await mapConcurrent(
  pythonManifest.packages,
  12,
  async (entry) => {
    const localLicense =
      pythonLicenses[`${entry.name.toLowerCase()}@${entry.version}`];
    return {
      ...entry,
      license:
        localLicense === undefined || localLicense === "UNKNOWN"
          ? await pythonRegistryLicense(entry)
          : localLicense,
    };
  },
);
await writeFile(
  pythonManifestPath,
  `${JSON.stringify(pythonManifest, null, 2)}\n`,
);

const assetRoot = resolve(workspace, "runtime/hydrated");
await mkdir(assetRoot, { recursive: true });
for (const name of ["chrome-for-testing", "wanted-sans", "inter"]) {
  const artifact = hydrated.find((entry) => entry.name === name);
  if (artifact?.localPath === null || artifact?.localPath === undefined) {
    throw new Error(`SUPPLY_PIN_UNAVAILABLE ${name} was not hydrated`);
  }
  const destination = resolve(assetRoot, name);
  await mkdir(destination, { recursive: true });
  run("unzip", [
    "-q",
    "-o",
    resolve(workspace, artifact.localPath),
    "-d",
    destination,
  ]);
}

const fontRoot = resolve(workspace, "verification/contract/fonts");
await mkdir(fontRoot, { recursive: true });
const wantedFont = await findFile(resolve(assetRoot, "wanted-sans"), [
  "WantedSansVariable.ttf",
]);
const interFont = await findFile(resolve(assetRoot, "inter"), [
  "InterVariable.ttf",
]);
if (wantedFont === undefined || interFont === undefined) {
  throw new Error(
    "SUPPLY_PIN_UNAVAILABLE required fixture fonts absent from pinned archives",
  );
}
await copyFile(wantedFont, resolve(fontRoot, "WantedSansVariable.ttf"));
await copyFile(interFont, resolve(fontRoot, "Inter.ttf"));

const baseImages = hydrated.filter((entry) => entry.digest !== undefined);
const debianBytes = await readFile(
  resolve(workspace, "runtime/debian-snapshot-manifest.json"),
  "utf8",
);
const containerManifestPath = resolve(
  workspace,
  "runtime/container-child-digest-manifest.json",
);
let builtImages = [];
try {
  const existingContainers = JSON.parse(
    await readFile(containerManifestPath, "utf8"),
  );
  if (Array.isArray(existingContainers.builtImages))
    builtImages = existingContainers.builtImages;
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
await writeFile(
  containerManifestPath,
  `${JSON.stringify({ schemaVersion: "rvs-container-children-v1", images: baseImages, builtImages }, null, 2)}\n`,
);

const ffmpeg = hydrated.find((entry) => entry.name === "ffmpeg");
const x264 = hydrated.find((entry) => entry.name === "x264-source");
const ffmpegManifestPath = resolve(
  workspace,
  "runtime/ffmpeg-build-manifest.json",
);
const x264ManifestPath = resolve(workspace, "runtime/x264-build-manifest.json");
let existingFfmpegManifest;
let existingX264Manifest;
try {
  existingFfmpegManifest = JSON.parse(
    await readFile(ffmpegManifestPath, "utf8"),
  );
  existingX264Manifest = JSON.parse(await readFile(x264ManifestPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (typeof existingFfmpegManifest?.binarySha256 !== "string") {
  await writeFile(
    ffmpegManifestPath,
    `${JSON.stringify({ schemaVersion: "rvs-ffmpeg-build-v1", source: ffmpeg, configure: ["--enable-gpl", "--enable-libx264"], binarySha256: null }, null, 2)}\n`,
  );
}
if (typeof existingX264Manifest?.binarySha256 !== "string") {
  await writeFile(
    x264ManifestPath,
    `${JSON.stringify({ schemaVersion: "rvs-x264-build-v1", source: x264, binarySha256: null }, null, 2)}\n`,
  );
}
await writeFile(
  resolve(workspace, "runtime/supply-closure-manifest.json"),
  `${JSON.stringify({ schemaVersion: "rvs-supply-closure-v1", artifacts: hydrated, debianSnapshotSha256: sha256(debianBytes) }, null, 2)}\n`,
);

process.stdout.write(
  `${JSON.stringify({ status: "hydrated", artifacts: hydrated.length, npmPackages: npmManifest.packages.length, pythonPackages: pythonManifest.packages.length, chrome: basename(resolve(assetRoot, "chrome-for-testing/chrome-linux64/chrome")), fonts: [basename(wantedFont), basename(interFont)] })}\n`,
);
