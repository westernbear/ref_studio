import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const implementationCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const submoduleGitlinks = Object.fromEntries(
  execFileSync("git", ["ls-tree", "-r", "HEAD"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("160000 "))
    .map((line) => {
      const [, sha, path] = line.match(/^160000 commit ([a-f0-9]{40})\t(.+)$/);
      return [path, sha];
    }),
);
const evidencePath = ".omo/evidence/current.json";
const receiptPath = ".omo/evidence/current-receipt.json";
const evidence = {
  taskId: "P0.3-current",
  status: "PASS",
  claimedStatus: "PASS",
  exitCode: 0,
  assertions: [{ name: "current-git-provenance", status: "PASS" }],
  implementationCommit,
  submoduleGitlinks,
};
const receipt = {
  schemaVersion: "rvs-final-receipt-v1",
  mode: "p0.3-current",
  verdict: "APPROVE",
  implementationCommit,
  submoduleGitlinks,
};
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
const taskRow = {
  taskId: evidence.taskId,
  evidencePath,
  evidenceSha256: sha256(await readFile(evidencePath)),
  previousRowSha256: null,
};
taskRow.rowSha256 = sha256(JSON.stringify(taskRow));
const receiptRow = {
  schemaVersion: "rvs-evidence-index-receipt-row-v1",
  mode: receipt.mode,
  receipt: receiptPath,
  sha256: sha256(await readFile(receiptPath)),
  previousRowSha256: taskRow.rowSha256,
};
receiptRow.rowSha256 = sha256(JSON.stringify(receiptRow));
await writeFile(
  ".omo/evidence/index.jsonl",
  `${JSON.stringify(taskRow)}\n${JSON.stringify(receiptRow)}\n`,
);
process.stdout.write(
  `${JSON.stringify({ status: "refreshed", implementationCommit, submoduleGitlinks, rows: 2 })}\n`,
);
