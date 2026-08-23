import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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

const serviceBlock = (service) =>
  compose.match(
    new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z]|^networks:)`, "m"),
  )?.[1] ?? "";

for (const service of [
  "runtime",
  "runtime-preflight",
  "compiler",
  "worker",
  "web",
  "api",
  "qa",
  "qa-audit-egress",
]) {
  if (serviceBlock(service) === "")
    throw new Error(`RUNTIME_CONFIG_UNFROZEN missing service ${service}`);
}

for (const service of ["runtime", "runtime-preflight", "compiler", "worker"]) {
  if (!serviceBlock(service).includes("network_mode: none")) {
    throw new Error(
      `RUNTIME_CONFIG_UNFROZEN ${service} is not network-isolated`,
    );
  }
}
if (!compose.match(/appnet:\n    internal: true/))
  throw new Error("RUNTIME_CONFIG_UNFROZEN appnet is not internal");

for (const service of ["web", "api"]) {
  if (!serviceBlock(service).includes("networks: [appnet]")) {
    throw new Error(
      `RUNTIME_CONFIG_UNFROZEN ${service} is not confined to appnet`,
    );
  }
}
if (!serviceBlock("qa").includes("network_mode: none"))
  throw new Error("RUNTIME_CONFIG_UNFROZEN qa is not network-isolated");

const auditConfig = serviceBlock("qa-audit-egress");
if (
  auditConfig.includes("networks:") ||
  auditConfig.includes("network_mode: none") ||
  auditConfig.includes("- .:/workspace") ||
  /(?:database|cas|appnet)/i.test(auditConfig)
) {
  throw new Error(
    "RUNTIME_CONFIG_UNFROZEN qa-audit-egress crosses an isolation boundary",
  );
}
process.stdout.write(
  `${JSON.stringify({ status: "runtime-config-frozen" })}\n`,
);
