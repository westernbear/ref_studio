import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, value, index, values) => {
    if (!value.startsWith("--")) return pairs;
    pairs.push([value.slice(2), values[index + 1]]);
    return pairs;
  }, []),
);
const input = args.input;
const lock = args.lock;
if (!input || !lock || args.policy !== "zero-high-critical")
  throw new Error("ADVISORY_ARGUMENTS_INVALID");
const advisory = JSON.parse(await readFile(input, "utf8"));
const lockText = await readFile(lock, "utf8");
const levels = advisory.metadata?.vulnerabilities ?? {};
if ((levels.high ?? 0) !== 0 || (levels.critical ?? 0) !== 0)
  throw new Error("ADVISORY_HIGH_CRITICAL");
if (
  (!advisory.auditReportVersion && !advisory.metadata) ||
  (!advisory.vulnerabilities && !advisory.advisories)
)
  throw new Error("ADVISORY_RESPONSE_INVALID");
const digest = createHash("sha256")
  .update(JSON.stringify(advisory))
  .digest("hex");
process.stdout.write(
  `${JSON.stringify({ status: "verified", digest, lockSha256: createHash("sha256").update(lockText).digest("hex"), high: levels.high ?? 0, critical: levels.critical ?? 0 })}\n`,
);
