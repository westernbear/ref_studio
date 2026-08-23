import { readFile } from "node:fs/promises";
const path = process.argv[2] ?? ".omo/evidence/index.jsonl";
const lines = (await readFile(path, "utf8")).trim().split("\n").filter(Boolean);
for (const line of lines) {
  const row = JSON.parse(line);
  if (!row.taskId || !row.evidenceSha256 || !row.rowSha256)
    throw new Error("EVIDENCE_SCHEMA_INVALID");
}
process.stdout.write(
  `${JSON.stringify({ status: "PASS", rows: lines.length })}\n`,
);
