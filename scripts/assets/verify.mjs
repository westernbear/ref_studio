import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const fixture = process.argv.includes("--fixture")
  ? process.argv[process.argv.indexOf("--fixture") + 1]
  : null;
const manifest = JSON.parse(
  readFileSync(resolve(workspace, "runtime/asset-manifest.json"), "utf8"),
);
for (const asset of manifest.assets) {
  const path =
    fixture === "missing-font" && asset.name === "Wanted Sans Variable"
      ? resolve(
          workspace,
          "runtime/.fixtures/missing-font/WantedSansVariable.ttf",
        )
      : resolve(workspace, asset.localPath);
  if (!existsSync(path))
    throw new Error(
      `RUNTIME_PREREQUISITE_MISSING ${asset.name} ${asset.localPath}`,
    );
  const hash = createHash("sha256").update(readFileSync(path)).digest("hex");
  if (hash !== asset.sha256)
    throw new Error(`ASSET_HASH_MISMATCH ${asset.name}`);
  for (const field of ["sourceUrl", "release", "license", "allowedConsumer"])
    if (!asset[field])
      throw new Error(`ASSET_METADATA_MISSING ${asset.name} ${field}`);
}
console.log(
  JSON.stringify({ status: "assets-verified", assets: manifest.assets.length }),
);
