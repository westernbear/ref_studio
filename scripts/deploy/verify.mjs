import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const rootCompose = await readFile(resolve(root, "docker-compose.yml"), "utf8");
const workerCompose = await readFile(
  resolve(root, "apps/worker/docker-compose.yml"),
  "utf8",
);
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
const serviceBlock = (compose, service) =>
  compose.match(
    new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z]|^networks:)`, "m"),
  )?.[1] ?? "";
const relay = serviceBlock(workerCompose, "api-relay");
const worker = serviceBlock(workerCompose, "worker");
const rootRelay = serviceBlock(rootCompose, "api-relay");
const rootWorker = serviceBlock(rootCompose, "worker");

if (!required.every((key) => execution[key] !== undefined))
  throw new Error("EXECUTION_CONTRACT_MISSING");
if (
  !rootCompose.includes("network_mode: none") ||
  !rootCompose.includes("internal: true")
)
  throw new Error("COMPOSE_ISOLATION_MISSING");
if (!serviceBlock(rootCompose, "web").includes("target: runtime"))
  throw new Error("COMPOSE_WEB_BUILD_MISSING");
if (!serviceBlock(rootCompose, "web").includes("0.0.0.0:3100:3100"))
  throw new Error("COMPOSE_WEB_EXTERNAL_BIND_MISSING");
if (!serviceBlock(rootCompose, "api").includes("target: runtime"))
  throw new Error("COMPOSE_API_BUILD_MISSING");
if (!serviceBlock(rootCompose, "api").includes("0.0.0.0:3200:3200"))
  throw new Error("COMPOSE_API_EXTERNAL_BIND_MISSING");
if (!serviceBlock(rootCompose, "api").includes("RVS_WORKER_TOKEN"))
  throw new Error("COMPOSE_API_WORKER_TOKEN_MISSING");
if (
  !rootRelay.includes("reference-video-studio-worker:1.0.0") ||
  !rootRelay.includes("context: ./apps/worker") ||
  !rootRelay.includes("RVS_API_BASE_URL: http://api:3200") ||
  !rootRelay.includes("- worker-internal")
)
  throw new Error("COMPOSE_WORKER_RELAY_DEFAULT_MISSING");
if (
  !rootWorker.includes("reference-video-studio-worker:1.0.0") ||
  !rootWorker.includes("context: ./apps/worker") ||
  !rootWorker.includes("RVS_API_BASE_URL: http://api-relay:8787") ||
  !rootWorker.includes("RVS_WORKER_TOKEN") ||
  !rootWorker.includes("- worker-internal") ||
  rootWorker.includes("- default")
)
  throw new Error("COMPOSE_WORKER_DEFAULT_MISSING");
if (
  !serviceBlock(rootCompose, "web").includes("/workspace/.pnpm-store") ||
  !serviceBlock(rootCompose, "web").includes("/workspace/node_modules") ||
  !serviceBlock(rootCompose, "web").includes("/workspace/apps/web/node_modules")
)
  throw new Error("COMPOSE_WEB_NODE_MODULES_VOLUME_MISSING");
for (const service of [
  "runtime",
  "runtime-preflight",
  "compiler",
  "qa",
  "qa-audit-egress",
]) {
  if (!serviceBlock(rootCompose, service).includes("profiles:"))
    throw new Error(`COMPOSE_DEFAULT_ONE_SHOT ${service}`);
}
if (
  !/^  worker-internal:\n    internal: true$/m.test(workerCompose) ||
  !relay.includes("- worker-internal") ||
  !relay.includes("- default") ||
  !worker.includes("- worker-internal") ||
  worker.includes("- default")
)
  throw new Error("WORKER_COMPOSE_ISOLATION_MISSING");
for (const service of ["api-relay", "worker"])
  if (!serviceBlock(workerCompose, service).includes("restart: always"))
    throw new Error(`WORKER_COMPOSE_RESTART_POLICY ${service}`);
if (
  !workerCompose.includes("x-worker-env-files: &worker-env-files") ||
  !workerCompose.includes("path: ../../.env") ||
  !workerCompose.includes("path: .env") ||
  !relay.includes("env_file: *worker-env-files") ||
  !worker.includes("env_file: *worker-env-files") ||
  worker.includes("RVS_WORKER_TOKEN: ${RVS_WORKER_TOKEN")
)
  throw new Error("WORKER_COMPOSE_ENV_FILE_CONTRACT_MISSING");
if (
  !relay.includes(
    "RVS_API_BASE_URL: ${RVS_API_BASE_URL:-http://host.docker.internal:3200}",
  ) ||
  !worker.includes("RVS_API_BASE_URL: http://api-relay:8787") ||
  !worker.includes(
    "RVS_API_REQUEST_TIMEOUT_MS: ${RVS_API_REQUEST_TIMEOUT_MS:-30000}",
  ) ||
  !worker.includes(
    "RVS_MEDIA_REQUEST_TIMEOUT_MS: ${RVS_MEDIA_REQUEST_TIMEOUT_MS:-1800000}",
  )
)
  throw new Error("WORKER_COMPOSE_RELAY_TIMEOUT_CONTRACT_MISSING");
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
    workerComposeIsolation: "verified",
    rootWorkerServices: ["api-relay", "worker"],
    workerRestartAlways: ["api-relay", "worker"],
    workerToken: "root-env-or-worker-env",
    workerRelay: "verified",
    workerApiTimeoutMs: 30_000,
    workerMediaTimeoutMs: 1_800_000,
    openapiPaths: Object.keys(openapi.paths).length,
  }) + "\n",
);
