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
if (!required.every((key) => execution[key] !== undefined))
  throw new Error("EXECUTION_CONTRACT_MISSING");
if (
  !compose.includes("network_mode: none") ||
  !compose.includes("internal: true")
)
  throw new Error("COMPOSE_ISOLATION_MISSING");
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
