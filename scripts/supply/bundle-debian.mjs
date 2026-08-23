import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const manifestPath = resolve(
  workspace,
  "runtime/debian-snapshot-manifest.json",
);
const bundlePath = resolve(workspace, "runtime/debian-packages.tar");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (
  manifest.schemaVersion !== "rvs-debian-snapshot-v1" ||
  !Array.isArray(manifest.packages)
) {
  throw new Error("SUPPLY_PIN_UNAVAILABLE invalid Debian closure manifest");
}

const files = [];
for (const entry of manifest.packages) {
  const path = resolve(workspace, entry.localPath);
  const bytes = await readFile(path);
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== entry.sha256)
    throw new Error(
      `SUPPLY_PIN_UNAVAILABLE Debian digest mismatch ${entry.name}`,
    );
  files.push(basename(path));
}

execFileSync(
  "tar",
  ["-cf", bundlePath, "-C", resolve(workspace, ".rvs-cache/debian"), ...files],
  {
    cwd: workspace,
    stdio: "inherit",
  },
);
const bundleSha256 = createHash("sha256")
  .update(await readFile(bundlePath))
  .digest("hex");
manifest.bundle = {
  path: "runtime/debian-packages.tar",
  sha256: bundleSha256,
  packages: files.length,
};
manifest.snapshotDigest = createHash("sha256")
  .update(
    JSON.stringify({
      nodeImage: manifest.nodeImage,
      packages: manifest.packages,
      bundle: manifest.bundle,
    }),
  )
  .digest("hex");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ status: "debian-bundle-created", packages: files.length, bundleSha256 })}\n`,
);
