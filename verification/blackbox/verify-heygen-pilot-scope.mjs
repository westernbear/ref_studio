import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const example = resolve(workspace, "examples/heygen-reference-project");
const project = JSON.parse(await readFile(resolve(example, "project.json")));
const result = JSON.parse(await readFile(resolve(example, "result.json")));
const brief = execFileSync(
  "unzip",
  ["-p", resolve(workspace, project.archive), "HANDOFF_PROMPT.md"],
  { encoding: "utf8" },
);

if (!/26\s*[~～–-]\s*28초/.test(brief))
  throw new Error("HEYGEN_SCOPE_DRIFT archive brief duration changed");
if (
  project.scope?.immutable !== true ||
  project.scope?.precedence !== "pilot-contract-over-archive-creative-brief" ||
  JSON.stringify(project.scope?.archiveBriefDurationSeconds) !== "[26,28]"
)
  throw new Error("HEYGEN_SCOPE_DRIFT pilot precedence changed");
if (
  project.interval?.startFrame !== 0 ||
  project.interval?.endFrameExclusive !== 120 ||
  project.interval?.frameCount !== 120 ||
  project.interval?.durationSeconds !== 4 ||
  project.source?.fps !== 30
)
  throw new Error("HEYGEN_SCOPE_DRIFT immutable interval changed");
if (
  project.pilotId !== result.pilotId ||
  project.releaseId !== result.releaseId
)
  throw new Error("HEYGEN_SCOPE_DRIFT pilot or release identity changed");

const approved = ["T1", "T2", "T3", "T4", "T5"].every(
  (gate) => result.workflow?.gateStatus?.[gate] === "APPROVED",
);
if (!approved || result.workflow?.gateStatus?.T6 !== "NOT_RUN")
  throw new Error("HEYGEN_SCOPE_DRIFT gate status changed");

process.stdout.write(
  `${JSON.stringify({ status: "heygen-pilot-scope-ok", pilotId: project.pilotId, releaseId: project.releaseId, interval: "[0,120)", durationSeconds: 4, archiveBriefDurationSeconds: [26, 28], approvedGates: ["T1", "T2", "T3", "T4", "T5"], releaseGate: { T6: "NOT_RUN" } })}\n`,
);
