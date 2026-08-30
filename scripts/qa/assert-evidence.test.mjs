import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const workspace = resolve(import.meta.dirname, "../..");
const temp = await mkdtemp(`${tmpdir()}/rvs-evidence-`);
const implementationCommit = (
  await run("git", ["rev-parse", "HEAD"], { cwd: workspace })
).stdout.trim();
const submoduleGitlinks = Object.fromEntries(
  (await run("git", ["ls-tree", "-r", "HEAD"], { cwd: workspace })).stdout
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("160000 "))
    .map((line) => {
      const [, sha, path] = line.match(/^160000 commit ([a-f0-9]{40})\t(.+)$/);
      return [path, sha];
    }),
);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const taskPath = resolve(temp, "task.json");
const receiptPath = resolve(temp, "receipt.json");
await writeFile(
  taskPath,
  `${JSON.stringify({ taskId: "T1", status: "PASS", implementationCommit, submoduleGitlinks })}\n`,
);
await writeFile(
  receiptPath,
  `${JSON.stringify({ schemaVersion: "rvs-final-receipt-v1", mode: "f1", verdict: "APPROVE", implementationCommit, submoduleGitlinks })}\n`,
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
const staleTask = JSON.parse(await readFile(taskPath, "utf8"));
staleTask.implementationCommit = "0".repeat(40);
await writeFile(taskPath, JSON.stringify(staleTask));
task.evidenceSha256 = digest(await readFile(taskPath));
const { rowSha256: taskRowSha256, ...taskWithoutHash } = task;
task.rowSha256 = digest(JSON.stringify(taskWithoutHash));
await writeFile(indexPath, `${JSON.stringify(task)}\n`);
try {
  await run("node", ["scripts/qa/assert-evidence.mjs", indexPath], {
    cwd: workspace,
  });
  throw new Error("STALE_COMMIT_ACCEPTED");
} catch (error) {
  if (!`${error.stderr ?? ""}${error.message ?? ""}`.includes("STALE_EVIDENCE"))
    throw error;
}
staleTask.implementationCommit = implementationCommit;
staleTask.submoduleGitlinks = {
  ...submoduleGitlinks,
  "apps/worker": "0".repeat(40),
};
await writeFile(taskPath, JSON.stringify(staleTask));
task.evidenceSha256 = digest(await readFile(taskPath));
delete task.rowSha256;
task.rowSha256 = digest(JSON.stringify(task));
await writeFile(indexPath, `${JSON.stringify(task)}\n`);
try {
  await run("node", ["scripts/qa/assert-evidence.mjs", indexPath], {
    cwd: workspace,
  });
  throw new Error("STALE_GITLINK_ACCEPTED");
} catch (error) {
  if (!`${error.stderr ?? ""}${error.message ?? ""}`.includes("STALE_EVIDENCE"))
    throw error;
}
await writeFile(
  taskPath,
  `${JSON.stringify({ taskId: "T1", status: "PASS", implementationCommit, submoduleGitlinks })}\n`,
);
task.evidenceSha256 = digest(await readFile(taskPath));
delete task.rowSha256;
task.rowSha256 = digest(JSON.stringify(task));
receipt.previousRowSha256 = task.rowSha256;
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
await rm(temp, { recursive: true });
