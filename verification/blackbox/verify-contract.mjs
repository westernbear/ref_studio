import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const workspace = resolve(import.meta.dirname, "../..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const lockPath = arg("--lock");
const rootPath = arg("--verifier-root");
if (!lockPath || !rootPath) throw new Error("VERIFY_ARGUMENTS_REQUIRED");
const lockBytes = await readFile(resolve(workspace, lockPath));
const lock = JSON.parse(lockBytes);
if (
  lock.schemaVersion !== "rvs-contract-lock-v1" ||
  lock.controlCount !== 151 ||
  lock.uniqueControlCount !== 151
)
  throw new Error("CONTROL_COVERAGE_INVALID");
for (const entry of lock.entries) {
  const bytes = await readFile(resolve(workspace, entry.path));
  if (bytes.byteLength !== entry.bytes || sha256(bytes) !== entry.sha256)
    throw new Error(`CONTRACT_DRIFT ${entry.path}`);
}
const rootText = await readFile(resolve(workspace, rootPath), "utf8");
const block = rootText.match(/```json\n([\s\S]*?)\n```/);
if (!block) throw new Error("VERIFIER_ROOT_MALFORMED");
const root = JSON.parse(block[1]);
if (
  root.parentRootSha256 !== lock.parentRootSha256 ||
  root.contractLockSha256 !== sha256(lockBytes)
)
  throw new Error("VERIFIER_ROOT_DRIFT");
if (!root.blackboxVerifierScriptSha256 || !root.forbiddenImportScanSha256)
  throw new Error("VERIFIER_ROOT_INCOMPLETE");
process.stdout.write(
  `${JSON.stringify({ status: "ok", controlCount: lock.controlCount, contractLockSha256: sha256(lockBytes), parentRootSha256: lock.parentRootSha256 })}\n`,
);
