import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  auditEgressIsolated,
  qaNetworkNone,
  serviceBlock,
} from "./compose-isolation.mjs";

const workspace = resolve(import.meta.dirname, "../..");
const dockerfile = await readFile(resolve(workspace, "Dockerfile"), "utf8");
const compose = await readFile(
  resolve(workspace, "docker-compose.yml"),
  "utf8",
);

const floatingFrom = dockerfile
  .split("\n")
  .filter(
    (line) =>
      line.startsWith("FROM ") &&
      !line.match(
        /^FROM (?:[a-z0-9._/-]+@sha256:[a-f0-9]{64}|[a-z0-9._/-]+)(?: AS [a-z0-9._/-]+)?$/,
      ),
  );
if (
  floatingFrom.length > 0 ||
  /(?:\/home\/|host\.docker\.internal)/m.test(`${dockerfile}\n${compose}`)
) {
  throw new Error(
    "RUNTIME_CONFIG_UNFROZEN host or floating runtime substitution detected",
  );
}

for (const service of [
  "runtime",
  "runtime-preflight",
  "compiler",
  "web",
  "api",
  "qa",
  "qa-audit-egress",
]) {
  if (serviceBlock(compose, service) === "")
    throw new Error(`RUNTIME_CONFIG_UNFROZEN missing service ${service}`);
}

for (const service of ["runtime", "runtime-preflight", "compiler"]) {
  if (!serviceBlock(compose, service).includes("network_mode: none")) {
    throw new Error(
      `RUNTIME_CONFIG_UNFROZEN ${service} is not network-isolated`,
    );
  }
}
if (!compose.match(/appnet:\n    internal: true/))
  throw new Error("RUNTIME_CONFIG_UNFROZEN appnet is not internal");

for (const service of ["web", "api"]) {
  const config = serviceBlock(compose, service);
  if (!config.includes("networks: [appnet, default]")) {
    throw new Error(
      `RUNTIME_CONFIG_UNFROZEN ${service} network topology changed`,
    );
  }
  if (!config.includes("restart: always"))
    throw new Error(
      `RUNTIME_CONFIG_UNFROZEN ${service} restart policy changed`,
    );
}
if (
  !serviceBlock(compose, "api").includes(
    "RVS_WORKER_TOKEN: ${RVS_WORKER_TOKEN:?RVS_WORKER_TOKEN must be set}",
  )
)
  throw new Error("RUNTIME_CONFIG_UNFROZEN API worker token is not required");
if (!qaNetworkNone(compose))
  throw new Error("RUNTIME_CONFIG_UNFROZEN qa is not network-isolated");
if (!auditEgressIsolated(compose)) {
  throw new Error(
    "RUNTIME_CONFIG_UNFROZEN qa-audit-egress crosses an isolation boundary",
  );
}
process.stdout.write(
  `${JSON.stringify({ status: "runtime-config-frozen" })}\n`,
);
