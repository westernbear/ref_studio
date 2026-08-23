import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DRIFT = "AUTHORITY_ROOT_DRIFT";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function verify() {
  const rootArgument = option("--root");
  const expected =
    option("--expected") ?? process.env.RVS_AUTHORITY_ROOT_SHA256;
  if (rootArgument === undefined || expected === undefined) {
    throw new Error(
      "--root and --expected (or RVS_AUTHORITY_ROOT_SHA256) are required",
    );
  }

  const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const rootPath = resolve(workspace, rootArgument);
  const rootBytes = await readFile(rootPath);
  const actualRootSha256 = sha256(rootBytes);
  if (actualRootSha256 !== expected) {
    throw new Error(
      `root sha256 expected=${expected} actual=${actualRootSha256}`,
    );
  }

  const blocks = [
    ...rootBytes.toString("utf8").matchAll(/```json\s*\n([\s\S]*?)\n```/g),
  ];
  if (blocks.length !== 1 || blocks[0]?.[1] === undefined) {
    throw new Error(
      `expected exactly one fenced json block; found=${blocks.length}`,
    );
  }

  const manifest = JSON.parse(blocks[0][1]);
  if (
    manifest.schemaVersion !== "rvs-authority-root-v1" ||
    !Array.isArray(manifest.entries)
  ) {
    throw new Error("invalid authority-root manifest schema");
  }

  const verifiedEntries = [];
  for (const entry of manifest.entries) {
    if (
      typeof entry?.path !== "string" ||
      typeof entry?.bytes !== "number" ||
      typeof entry?.sha256 !== "string"
    ) {
      throw new Error("invalid authority-root entry");
    }
    const entryPath = resolve(workspace, entry.path);
    const entryStat = await stat(entryPath);
    const bytes = await readFile(entryPath);
    const digest = sha256(bytes);
    if (
      !entryStat.isFile() ||
      bytes.byteLength !== entry.bytes ||
      digest !== entry.sha256
    ) {
      throw new Error(
        `entry mismatch path=${entry.path} bytes=${bytes.byteLength}/${entry.bytes} sha256=${digest}/${entry.sha256}`,
      );
    }
    verifiedEntries.push(entry.path);
  }

  process.stdout.write(
    `${JSON.stringify({ status: "ok", schemaVersion: manifest.schemaVersion, rootSha256: actualRootSha256, verifiedEntries })}\n`,
  );
}

try {
  await verify();
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${DRIFT}: ${detail}\n`);
  process.exitCode = 1;
}
