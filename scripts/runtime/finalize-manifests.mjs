import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const image = "reference-video-studio-runtime:1.0.0";

function run(command, args) {
  return execFileSync(command, args, {
    cwd: workspace,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function digestFiles(paths) {
  const output = run("docker", [
    "run",
    "--rm",
    "--network",
    "none",
    "--entrypoint",
    "sha256sum",
    image,
    ...paths,
  ]);
  return new Map(
    output.split("\n").map((line) => {
      const [digest, path] = line.trim().split(/\s+/, 2);
      if (digest === undefined || path === undefined)
        throw new Error(`invalid sha256sum output: ${line}`);
      return [path, digest];
    }),
  );
}

const supply = JSON.parse(
  await readFile(
    resolve(
      workspace,
      ".omo/drafts/reference-video-studio-saas-supply-chain.json",
    ),
    "utf8",
  ),
);
const debian = JSON.parse(
  await readFile(
    resolve(workspace, "runtime/debian-snapshot-manifest.json"),
    "utf8",
  ),
);
const imageInspect = JSON.parse(run("docker", ["image", "inspect", image]))[0];
if (
  imageInspect?.Id === undefined ||
  !Array.isArray(imageInspect.RootFS?.Layers)
) {
  throw new Error(
    "SUPPLY_PIN_UNAVAILABLE built runtime image identity is missing",
  );
}

const paths = [
  "/opt/rvs/bin/ffmpeg",
  "/opt/rvs/bin/ffprobe",
  "/opt/rvs/bin/convert",
  "/opt/rvs/lib/libx264.a",
  "/opt/chrome/chrome",
  "/opt/rvs/fonts/WantedSansVariable.ttf",
  "/opt/rvs/fonts/Inter.ttf",
  "/opt/uv/uv",
  "/usr/local/bin/node",
  "/usr/local/bin/python3.12",
];
const digests = digestFiles(paths);
const contentDigest = `sha256:${createHash("sha256")
  .update(
    JSON.stringify({
      rootfsLayers: imageInspect.RootFS.Layers,
      artifacts: [...digests.entries()].sort(),
    }),
  )
  .digest("hex")}`;
const artifact = (name) => {
  const match = supply.artifacts.find((entry) => entry.name === name);
  if (match === undefined)
    throw new Error(`SUPPLY_PIN_UNAVAILABLE missing source artifact ${name}`);
  return match;
};
const digest = (path) => {
  const value = digests.get(path);
  if (value === undefined)
    throw new Error(`SUPPLY_PIN_UNAVAILABLE missing runtime digest ${path}`);
  return value;
};

const ffmpegVersion = run("docker", [
  "run",
  "--rm",
  "--network",
  "none",
  "--entrypoint",
  "ffmpeg",
  image,
  "-version",
]);
const ffmpegManifest = {
  schemaVersion: "rvs-ffmpeg-build-v1",
  source: artifact("ffmpeg"),
  x264Source: artifact("x264-source"),
  debianSnapshotDigest: debian.snapshotDigest,
  configure: [
    "--prefix=/opt/rvs",
    "--disable-debug",
    "--disable-doc",
    "--enable-gpl",
    "--enable-libfreetype",
    "--enable-libharfbuzz",
    "--enable-libx264",
    "--extra-cflags=-I/opt/rvs/include",
    "--extra-ldflags=-L/opt/rvs/lib",
  ],
  binaryPath: "/opt/rvs/bin/ffmpeg",
  binarySha256: digest("/opt/rvs/bin/ffmpeg"),
  ffprobeSha256: digest("/opt/rvs/bin/ffprobe"),
  version: ffmpegVersion.split("\n")[0],
  license:
    "GPL-2.0-or-later runtime; source artifacts and build inputs retained",
};
const x264Manifest = {
  schemaVersion: "rvs-x264-build-v1",
  source: artifact("x264-source"),
  debianSnapshotDigest: debian.snapshotDigest,
  configure: [
    "--prefix=/opt/rvs",
    "--enable-static",
    "--disable-cli",
    "--disable-opencl",
  ],
  binaryPath: "/opt/rvs/lib/libx264.a",
  binarySha256: digest("/opt/rvs/lib/libx264.a"),
  license: "GPL-2.0-or-later",
};
await writeFile(
  resolve(workspace, "runtime/ffmpeg-build-manifest.json"),
  `${JSON.stringify(ffmpegManifest, null, 2)}\n`,
);
await writeFile(
  resolve(workspace, "runtime/x264-build-manifest.json"),
  `${JSON.stringify(x264Manifest, null, 2)}\n`,
);

const containerPath = resolve(
  workspace,
  "runtime/container-child-digest-manifest.json",
);
const containers = JSON.parse(await readFile(containerPath, "utf8"));
containers.builtImages = [
  {
    name: image,
    contentDigest,
    rootfsLayers: imageInspect.RootFS.Layers,
    parentDigests: containers.images.map((entry) => entry.digest),
  },
];
await writeFile(containerPath, `${JSON.stringify(containers, null, 2)}\n`);

const runtimeArtifacts = {
  schemaVersion: "rvs-runtime-artifacts-v1",
  image: { name: image, contentDigest },
  artifacts: [
    {
      name: "ffmpeg",
      version: "8.0.1",
      path: "/opt/rvs/bin/ffmpeg",
      sha256: digest("/opt/rvs/bin/ffmpeg"),
    },
    {
      name: "ffprobe",
      version: "8.0.1",
      path: "/opt/rvs/bin/ffprobe",
      sha256: digest("/opt/rvs/bin/ffprobe"),
    },
    {
      name: "x264",
      version: artifact("x264-source").version,
      path: "/opt/rvs/lib/libx264.a",
      sha256: digest("/opt/rvs/lib/libx264.a"),
    },
    {
      name: "imagemagick",
      version: "6.9.12-98",
      path: "/opt/rvs/bin/convert",
      sha256: digest("/opt/rvs/bin/convert"),
    },
    {
      name: "chrome-for-testing",
      version: "151.0.7922.138",
      path: "/opt/chrome/chrome",
      sha256: digest("/opt/chrome/chrome"),
    },
    {
      name: "wanted-sans",
      version: "1.0.3",
      path: "/opt/rvs/fonts/WantedSansVariable.ttf",
      sha256: digest("/opt/rvs/fonts/WantedSansVariable.ttf"),
    },
    {
      name: "inter",
      version: "4.1",
      path: "/opt/rvs/fonts/Inter.ttf",
      sha256: digest("/opt/rvs/fonts/Inter.ttf"),
    },
    {
      name: "uv",
      version: "0.11.8",
      path: "/opt/uv/uv",
      sha256: digest("/opt/uv/uv"),
    },
    {
      name: "node",
      version: "24.19.0",
      path: "/usr/local/bin/node",
      sha256: digest("/usr/local/bin/node"),
    },
    {
      name: "python",
      version: "3.12.14",
      path: "/usr/local/bin/python3.12",
      sha256: digest("/usr/local/bin/python3.12"),
    },
  ],
};
await writeFile(
  resolve(workspace, "runtime/runtime-artifact-manifest.json"),
  `${JSON.stringify(runtimeArtifacts, null, 2)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ status: "runtime-manifests-finalized", image: contentDigest, artifacts: runtimeArtifacts.artifacts.length })}\n`,
);
