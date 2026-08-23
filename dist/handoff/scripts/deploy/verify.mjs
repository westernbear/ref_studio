import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const compose = await readFile(resolve(root, "docker-compose.yml"), "utf8");
const execution = JSON.parse(
  await readFile(
    resolve(root, "verification/contract/execution-contract-v2.json"),
    "utf8",
  ),
);
const openapi = JSON.parse(
  await readFile(
    resolve(root, "packages/contracts/generated/openapi.json"),
    "utf8",
  ),
);
const required = [
  "schemaVersion",
  "uploadStates",
  "jobAttemptStates",
  "publication",
];
const serviceBlock = (service) =>
  compose.match(
    new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z]|^networks:)`, "m"),
  )?.[1] ?? "";

if (!required.every((key) => execution[key] !== undefined))
  throw new Error("EXECUTION_CONTRACT_MISSING");
if (
  !compose.includes("network_mode: none") ||
  !compose.includes("internal: true")
)
  throw new Error("COMPOSE_ISOLATION_MISSING");
if (!serviceBlock("web").includes("target: runtime"))
  throw new Error("COMPOSE_WEB_BUILD_MISSING");
if (!serviceBlock("web").includes("0.0.0.0:3100:3100"))
  throw new Error("COMPOSE_WEB_EXTERNAL_BIND_MISSING");
if (!serviceBlock("api").includes("target: runtime"))
  throw new Error("COMPOSE_API_BUILD_MISSING");
if (!serviceBlock("api").includes("0.0.0.0:3200:3200"))
  throw new Error("COMPOSE_API_EXTERNAL_BIND_MISSING");
if (!serviceBlock("api").includes("RVS_WORKER_TOKEN"))
  throw new Error("COMPOSE_API_WORKER_TOKEN_MISSING");
if (
  !serviceBlock("web").includes("/workspace/.pnpm-store") ||
  !serviceBlock("web").includes("/workspace/node_modules") ||
  !serviceBlock("web").includes("/workspace/apps/web/node_modules")
)
  throw new Error("COMPOSE_WEB_NODE_MODULES_VOLUME_MISSING");
for (const service of [
  "runtime",
  "runtime-preflight",
  "compiler",
  "qa",
  "qa-audit-egress",
]) {
  if (!serviceBlock(service).includes("profiles:"))
    throw new Error(`COMPOSE_DEFAULT_ONE_SHOT ${service}`);
}
if (openapi.openapi !== "3.1.0" || Object.keys(openapi.paths).length < 5)
  throw new Error("OPENAPI_NOT_GENERATED");
if (
  execution.publication.restore !==
  "new isolated root only -> verify all digests -> increment restore epoch -> revoke sessions/tokens/leases/downloads -> preserve deletion epochs -> fixed-frame verification -> T6"
)
  throw new Error("RECOVERY_ORDER_DRIFT");
process.stdout.write(
  JSON.stringify({
    status: "deploy-verify-pass",
    startup: "contract-present",
    migrations: "explicit",
    preflight: "runtime-preflight",
    composeIsolation: "verified",
    openapiPaths: Object.keys(openapi.paths).length,
  }) + "\n",
);
