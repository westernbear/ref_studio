import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const workspace = resolve(import.meta.dirname, "../..");
const temp = await mkdtemp(`${tmpdir()}/rvs-evidence-`);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const taskPath = resolve(temp, "task.json");
const receiptPath = resolve(temp, "receipt.json");
await writeFile(taskPath, '{"taskId":"T1","status":"PASS"}\n');
await writeFile(
  receiptPath,
  '{"schemaVersion":"rvs-final-receipt-v1","mode":"f1","verdict":"APPROVE"}\n',
);
const task = {
  taskId: "T1",
  evidencePath: taskPath,
  evidenceSha256: digest(await readFile(taskPath)),
  previousRowSha256: null,
};
task.rowSha256 = digest(JSON.stringify(task));
const receipt = {
  schemaVersion: "rvs-evidence-index-receipt-row-v1",
  mode: "f1",
  receipt: receiptPath,
  sha256: digest(await readFile(receiptPath)),
  previousRowSha256: task.rowSha256,
};
receipt.rowSha256 = digest(JSON.stringify(receipt));
const indexPath = resolve(temp, "index.jsonl");
await writeFile(
  indexPath,
  `${JSON.stringify(task)}\n${JSON.stringify(receipt)}\n`,
);
const parsed = await run(
  "node",
  ["scripts/qa/assert-evidence.mjs", indexPath],
  {
    cwd: workspace,
  },
);
if (
  !parsed.stdout.includes('"taskRows":1') ||
  !parsed.stdout.includes('"receiptRows":1')
)
  throw new Error("MIXED_EVIDENCE_INDEX_REJECTED");
const {
  schemaVersion,
  rowSha256: receiptRowSha256,
  ...legacyReceipt
} = receipt;
legacyReceipt.rowSha256 = digest(JSON.stringify(legacyReceipt));
await writeFile(
  indexPath,
  `${JSON.stringify(task)}\n${JSON.stringify(legacyReceipt)}\n`,
);
await run("node", ["scripts/qa/assert-evidence.mjs", indexPath], {
  cwd: workspace,
});
receipt.sha256 = "0".repeat(64);
const { rowSha256, ...tamperedReceipt } = receipt;
receipt.rowSha256 = digest(JSON.stringify(tamperedReceipt));
await writeFile(
  indexPath,
  `${JSON.stringify(task)}\n${JSON.stringify(receipt)}\n`,
);
try {
  await run("node", ["scripts/qa/assert-evidence.mjs", indexPath], {
    cwd: workspace,
  });
  throw new Error("TAMPERED_RECEIPT_ACCEPTED");
} catch (error) {
  if (
    !`${error.stderr ?? ""}${error.message ?? ""}`.includes(
      "EVIDENCE_DIGEST_INVALID",
    )
  )
    throw error;
}
process.stdout.write(
  '{"status":"PASS","scenario":"mixed task and receipt index rows"}\n',
);
