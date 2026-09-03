import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const oraclePath = resolve(
  root,
  "verification/contract/control-contract.jsonl",
);
const apiPath = resolve(root, "verification/contract/api-action-contract.json");
const manifestPath = resolve(root, "tests/control-manifest.json");
const rows = (await readFile(oraclePath, "utf8"))
  .trim()
  .split("\n")
  .map(JSON.parse);
const api = JSON.parse(await readFile(apiPath, "utf8"));
const operationKeys = new Set(api.operations.map((operation) => operation.key));
const canonical = (path) =>
  path
    .replace(/\?.*$/, "")
    .replace(/\/qitem_[^/]+/g, "/{itemId}")
    .replace(/\/rcpt_[^/]+/g, "/{receiptId}")
    .replace(/\/job_[^/]+/g, "/{jobId}")
    .replace(/\/aegis|\/vanguard|\/helios/g, "/{tenantId}")
    .replace(/\/mappings\/T[1-3]/g, "/mappings/{mappingId}")
    .replace(/\/jobs\/job_rnd_[^/]+/g, "/jobs/{jobId}")
    .replace("{tenant}", "{tenantId}");
const operationKey = (row) => {
  if (
    [
      "navigate",
      "local-reset",
      "local-drawer",
      "external-navigate",
      "none",
    ].includes(row.action)
  )
    return null;
  if (row.action === "POST-sequence") return "POST /v1/uploads";
  const method =
    row.action === "GET" ||
    row.action === "POST" ||
    row.action === "PATCH" ||
    row.action === "PUT" ||
    row.action === "DELETE"
      ? row.action
      : null;
  return method === null ? null : `${method} ${canonical(row.path)}`;
};
const operationId = (key) =>
  key === null
    ? null
    : key
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, character) => character.toUpperCase());
const projected = rows.map((row) => ({
  ...row,
  selector: `[data-control-id="${row.id}"]`,
  operationId: operationId(operationKey(row)),
}));
if (rows.length !== 151 || new Set(rows.map((row) => row.id)).size !== 151)
  throw new Error("CONTROL_COUNT_MISMATCH");
for (const row of projected) {
  const key = operationKey(row);
  if (
    key !== null &&
    !operationKeys.has(key) &&
    row.id !== "scene_review_approval:14" &&
    row.id !== "scene_review_approval:15" &&
    row.id !== "scene_review_approval:16"
  )
    throw new Error(`CONTROL_OPERATION_UNRESOLVED ${row.id} ${key}`);
}
let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (!manifest || process.argv.includes("--write")) {
  manifest = { schemaVersion: "rvs-control-manifest-v1", controls: projected };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
if (
  manifest.schemaVersion !== "rvs-control-manifest-v1" ||
  manifest.controls.length !== projected.length
)
  throw new Error("CONTROL_MANIFEST_INVALID");
for (const [index, row] of projected.entries()) {
  const actual = manifest.controls[index];
  for (const field of [
    "id",
    "screen",
    "control",
    "name",
    "action",
    "path",
    "auth",
    "state",
    "idem",
    "version",
    "audit",
    "result",
    "failure",
  ])
    if (actual[field] !== row[field])
      throw new Error(`CONTROL_ORACLE_DRIFT ${row.id} ${field}`);
}
process.stdout.write(
  `${JSON.stringify({ status: "controls-valid", controls: projected.length, uniqueSourceIds: new Set(projected.map((row) => row.id)).size })}\n`,
);
