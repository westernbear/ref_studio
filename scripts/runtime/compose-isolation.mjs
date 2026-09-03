export function serviceBlock(compose, service) {
  return (
    compose.match(
      new RegExp(`^  ${service}:\\n([\\s\\S]*?)(?=^  [a-z]|^networks:)`, "m"),
    )?.[1] ?? ""
  );
}

export function qaNetworkNone(compose) {
  return serviceBlock(compose, "qa").includes("network_mode: none");
}

export function auditEgressIsolated(compose) {
  const audit = serviceBlock(compose, "qa-audit-egress");
  return !(
    audit.includes("networks:") ||
    audit.includes("network_mode: none") ||
    audit.includes("- .:/workspace") ||
    /(?:database|cas|appnet)/i.test(audit)
  );
}
