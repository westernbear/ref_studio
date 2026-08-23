import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname } from "node:path";
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
export async function appendEvidence(indexPath, evidencePath, row) {
  let evidence;
  try {
    evidence = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch {
    throw new Error("EVIDENCE_INVALID");
  }
  if (evidence.stale === true) throw new Error("STALE_EVIDENCE");
  if (
    evidence.status !== "PASS" ||
    (evidence.claimedStatus === "PASS" && evidence.exitCode !== 0)
  )
    throw new Error("MISLEADING_SUCCESS_OUTPUT");
  if (
    !evidence.taskId ||
    !Array.isArray(evidence.assertions) ||
    evidence.assertions.some((a) => a.status !== "PASS")
  )
    throw new Error("EVIDENCE_INVALID");
  await mkdir(dirname(indexPath), { recursive: true });
  const lock = await open(`${indexPath}.lock`, "wx").catch(() => {
    throw new Error("EVIDENCE_WRITER_BUSY");
  });
  try {
    const previous = await readFile(indexPath, "utf8").catch(() => "");
    const previousRowSha256 = previous.trim()
      ? JSON.parse(previous.trim().split("\n").at(-1)).rowSha256
      : null;
    const output = {
      ...row,
      taskId: evidence.taskId,
      evidencePath,
      evidenceSha256: sha256(await readFile(evidencePath)),
      previousRowSha256,
    };
    output.rowSha256 = sha256(Buffer.from(JSON.stringify(output)));
    const index = await open(indexPath, "a");
    try {
      await index.appendFile(`${JSON.stringify(output)}\n`);
    } finally {
      await index.close();
    }
  } finally {
    await lock.close();
    await unlink(`${indexPath}.lock`).catch(() => {});
  }
}
