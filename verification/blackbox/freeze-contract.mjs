import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = async (path) => readFile(resolve(workspace, path));
const source = arg("--source");
const normative = arg("--normative");
const supply = arg("--supply");
const controls = arg("--controls");
const api = arg("--api-actions");
const verification = arg("--verification");
const emit = arg("--emit-verifier-root");
if (
  [source, normative, supply, controls, api, verification, emit].some(
    (v) => v === undefined,
  )
)
  throw new Error("FREEZE_ARGUMENTS_REQUIRED");

const rows = (await text(controls))
  .toString("utf8")
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
if (rows.length !== 151 || new Set(rows.map((row) => row.id)).size !== 151)
  throw new Error(`CONTROL_COUNT_MISMATCH expected=151 actual=${rows.length}`);
const verificationDoc = JSON.parse(await text(verification));
if (verificationDoc.authority.controlRows !== 151)
  throw new Error("CONTROL_AUTHORITY_MISMATCH");
const apiDoc = JSON.parse(await text(api));
if (
  apiDoc.schemaVersion !== "rvs-api-action-contract-v3" ||
  !Array.isArray(apiDoc.operations)
)
  throw new Error("OPENAPI_AUTHORITY_INVALID");
for (const operation of apiDoc.operations) {
  const [method, path] = operation.key.split(" ");
  if (!method || !path || !operation.request || !operation.success)
    throw new Error(`OPENAPI_OPERATION_INVALID ${operation.key}`);
}
const rootPath = resolve(
  workspace,
  ".omo/drafts/reference-video-studio-saas-authority-root.md",
);
const parentRootSha256 = sha256(await readFile(rootPath));
const files = [
  ["normative-inputs.json", normative],
  ["supply-chain.json", supply],
  ["control-contract.jsonl", controls],
  ["api-action-contract.json", api],
  ["verification-contract.json", verification],
  [
    "execution-contract-v2.json",
    ".omo/drafts/reference-video-studio-saas-execution-contract-v2.json",
  ],
  [
    "audit-registry-v2.json",
    ".omo/drafts/reference-video-studio-saas-audit-registry-v2.json",
  ],
  [
    "visual-contract-v2.json",
    ".omo/drafts/reference-video-studio-saas-visual-contract-v2.json",
  ],
  [
    "visual-landmarks-v1.json",
    ".omo/drafts/reference-video-studio-saas-visual-landmarks-v1.json",
  ],
  [
    "fixture-contract-v2.json",
    ".omo/drafts/reference-video-studio-saas-fixture-contract-v2.json",
  ],
  [
    "media-contract-v2.json",
    ".omo/drafts/reference-video-studio-saas-media-contract-v2.json",
  ],
];
const contractDir = resolve(workspace, "verification/contract");
await mkdir(contractDir, { recursive: true });
const entries = [];
for (const [name, path] of files) {
  const bytes = await text(path);
  await writeFile(resolve(contractDir, name), bytes);
  entries.push({
    path: `verification/contract/${name}`,
    sha256: sha256(bytes),
    bytes: bytes.byteLength,
  });
}
const lock = {
  schemaVersion: "rvs-contract-lock-v1",
  parentRootSha256,
  controlCount: rows.length,
  uniqueControlCount: new Set(rows.map((r) => r.id)).size,
  entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
};
const lockBytes = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`);
await writeFile(
  resolve(workspace, "verification/contract-lock.json"),
  lockBytes,
);
const lockSha256 = sha256(lockBytes);
const scripts = [
  "verification/blackbox/freeze-contract.mjs",
  "verification/blackbox/evidence-writer.mjs",
  "scripts/qa/assert-evidence.mjs",
];
const scriptDigests = Object.fromEntries(
  await Promise.all(
    scripts.map(async (path) => [
      path,
      sha256(await readFile(resolve(workspace, path))),
    ]),
  ),
);
const forbiddenImportScanSha256 = sha256(
  Buffer.from("apps/|packages/|compiler/|scripts/qa/validators/\n"),
);
const root = `# Todo 3 verifier root\n\nExternally anchored verifier extension.\n\n\`\`\`json\n${JSON.stringify({ schemaVersion: "rvs-verifier-root-v1", parentRootSha256, contractLockSha256: lockSha256, blackboxVerifierScriptSha256: scriptDigests, forbiddenImportScanSha256 }, null, 2)}\n\`\`\`\n`;
await writeFile(resolve(workspace, emit), root);
process.stdout.write(
  `${JSON.stringify({ status: "frozen", controlCount: rows.length, parentRootSha256, contractLockSha256: lockSha256 })}\n`,
);
