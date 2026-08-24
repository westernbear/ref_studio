import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const example = resolve(workspace, "examples/heygen-reference-project");
const project = JSON.parse(await readFile(resolve(example, "project.json")));
const result = JSON.parse(await readFile(resolve(example, "result.json")));
const evidenceDigest =
  "9f7e0da69c9fcb7e1f4b48528f6cb2806ed46e9b462829485749f18fcf0361bc";
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

if (
  result.protocol !== "rvs.example-result.v2" ||
  result.status !== "TECHNICAL_PIPELINE_COMPLETED" ||
  result.gateAuthoritative !== false ||
  result.prepare?.evidenceDigest !== evidenceDigest
)
  throw new Error("HEYGEN_SCOPE_DRIFT technical result changed");
if (
  result.workflow?.choiceResolution?.status !== "UNRESOLVED" ||
  JSON.stringify(result.workflow.choiceResolution.choiceIds) !==
    '["choice_foreground_subject_ownership"]'
)
  throw new Error("HEYGEN_SCOPE_DRIFT choice resolution changed");
if (
  JSON.stringify(result.workflow?.tenantGates) !==
    '{"scope":"T1-T5","status":"NOT_ESTABLISHED","receiptIds":[]}' ||
  JSON.stringify(result.workflow?.releaseGate) !==
    '{"gate":"T6","status":"NOT_RUN","receiptId":null}' ||
  result.workflow?.gateStatus !== undefined ||
  result.workflow?.finalState !== undefined
)
  throw new Error("HEYGEN_SCOPE_DRIFT approval authority changed");

process.stdout.write(
  `${JSON.stringify({ status: "heygen-pilot-scope-ok", pilotId: project.pilotId, releaseId: project.releaseId, interval: "[0,120)", durationSeconds: 4, archiveBriefDurationSeconds: [26, 28], evidenceDigest, technicalPipelineStatus: result.status, gateAuthoritative: false, choiceResolution: result.workflow.choiceResolution, tenantGates: result.workflow.tenantGates, releaseGate: result.workflow.releaseGate })}\n`,
);
