import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hashPattern = /^[a-f0-9]{64}$/;
const fail = (code) => {
  throw new Error(code);
};
const parseJson = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return fail("EVIDENCE_JSON_INVALID");
  }
};
const currentProvenance = () => ({
  implementationCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  submoduleGitlinks: Object.fromEntries(
    execFileSync("git", ["ls-tree", "-r", "HEAD"], { encoding: "utf8" })
      .trim()
      .split("\n")
      .filter((line) => line.startsWith("160000 "))
      .map((line) => {
        const [, sha, path] =
          line.match(/^160000 commit ([a-f0-9]{40})\t(.+)$/) ?? [];
        if (!sha || !path) fail("EVIDENCE_PROVENANCE_INVALID");
        return [path, sha];
      }),
  ),
});
const validateProvenance = (evidence, current) => {
  if (
    typeof evidence.implementationCommit !== "string" ||
    !/^[a-f0-9]{40}$/.test(evidence.implementationCommit) ||
    evidence.submoduleGitlinks === null ||
    typeof evidence.submoduleGitlinks !== "object" ||
    Array.isArray(evidence.submoduleGitlinks) ||
    Object.values(evidence.submoduleGitlinks).some(
      (sha) => typeof sha !== "string" || !/^[a-f0-9]{40}$/.test(sha),
    )
  )
    fail("EVIDENCE_PROVENANCE_INVALID");
  if (
    evidence.implementationCommit !== current.implementationCommit ||
    Object.keys(evidence.submoduleGitlinks).length !==
      Object.keys(current.submoduleGitlinks).length ||
    Object.entries(current.submoduleGitlinks).some(
      ([path, sha]) => evidence.submoduleGitlinks[path] !== sha,
    )
  )
    fail("STALE_EVIDENCE");
};
const readHashedJson = async (path, expectedHash) => {
  if (typeof expectedHash !== "string" || !hashPattern.test(expectedHash))
    fail("EVIDENCE_HASH_INVALID");
  let value;
  try {
    value = await readFile(path);
  } catch {
    return fail("EVIDENCE_ARTIFACT_MISSING");
  }
  if (sha256(value) !== expectedHash) fail("EVIDENCE_DIGEST_INVALID");
  return parseJson(value.toString("utf8"));
};
const rowHash = (row) => {
  const { rowSha256, ...withoutHash } = row;
  return sha256(JSON.stringify(withoutHash));
};
const pathFor = (root, value) =>
  typeof value === "string" && value.length > 0
    ? resolve(root, value)
    : fail("EVIDENCE_PATH_INVALID");
const validateTask = async (root, row, provenance) => {
  if (typeof row.taskId !== "string" || row.taskId.length === 0)
    fail("EVIDENCE_TASK_INVALID");
  const evidence = await readHashedJson(
    pathFor(root, row.evidencePath),
    row.evidenceSha256,
  );
  validateProvenance(evidence, provenance);
  if (evidence.taskId !== row.taskId) fail("EVIDENCE_TASK_MISMATCH");
};
const validateReceipt = async (root, row, provenance) => {
  if (
    row.schemaVersion !== undefined &&
    row.schemaVersion !== "rvs-evidence-index-receipt-row-v1"
  )
    fail("EVIDENCE_RECEIPT_ROW_VERSION_INVALID");
  if (typeof row.mode !== "string" || row.mode.length === 0)
    fail("EVIDENCE_RECEIPT_INVALID");
  const receipt = await readHashedJson(pathFor(root, row.receipt), row.sha256);
  validateProvenance(receipt, provenance);
  if (
    receipt.schemaVersion !== "rvs-final-receipt-v1" ||
    receipt.mode !== row.mode ||
    !["PASS", "APPROVE"].includes(receipt.verdict)
  )
    fail("EVIDENCE_RECEIPT_INVALID");
};

const path = process.argv[2] ?? ".omo/evidence/index.jsonl";
const root = process.cwd();
const provenance = currentProvenance();
const lines = (await readFile(path, "utf8")).trim().split("\n").filter(Boolean);
let previousRowSha256 = null;
let taskRows = 0;
let receiptRows = 0;
const receiptPaths = new Set();
for (const line of lines) {
  const row = parseJson(line);
  const isTask = Object.hasOwn(row, "taskId");
  const isReceipt = Object.hasOwn(row, "receipt");
  if (isTask === isReceipt) fail("EVIDENCE_ROW_KIND_INVALID");
  if (
    typeof row.rowSha256 !== "string" ||
    !hashPattern.test(row.rowSha256) ||
    row.rowSha256 !== rowHash(row)
  )
    fail("EVIDENCE_ROW_HASH_INVALID");
  if (row.previousRowSha256 !== previousRowSha256)
    fail("EVIDENCE_CHAIN_INVALID");
  if (isTask) {
    await validateTask(root, row, provenance);
    taskRows += 1;
  } else {
    if (receiptPaths.has(row.receipt)) fail("EVIDENCE_RECEIPT_DUPLICATE");
    receiptPaths.add(row.receipt);
    await validateReceipt(root, row, provenance);
    receiptRows += 1;
  }
  previousRowSha256 = row.rowSha256;
}
process.stdout.write(
  `${JSON.stringify({ status: "PASS", rows: lines.length, taskRows, receiptRows })}\n`,
);
