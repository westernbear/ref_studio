import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const stamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
const dir = resolve(root, `.omo/evidence/p7-1-automated-gate-${stamp}Z`);
const run = (label, command, args, extra = {}) => {
  const started = Date.now();
  try {
    const stdout = execFileSync(command, args, {
      cwd: extra.cwd ?? root,
      encoding: "utf8",
      timeout: extra.timeoutMs ?? 600_000,
      env: { ...process.env, ...extra.env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return {
      label,
      status: "PASS",
      elapsedMs: Date.now() - started,
      stdout: stdout.slice(-8_000),
    };
  } catch (error) {
    return {
      label,
      status: "FAIL",
      elapsedMs: Date.now() - started,
      stdout: `${error.stdout ?? ""}${error.stderr ?? error.message}`.slice(
        -8_000,
      ),
    };
  }
};

await mkdir(dir, { recursive: true });
const implementationCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const worker = execFileSync("git", ["ls-tree", "HEAD", "apps/worker"], {
  cwd: root,
  encoding: "utf8",
}).match(/([a-f0-9]{40})/)?.[1];
const adobe = execFileSync(
  "git",
  ["ls-tree", "HEAD", "integrations/adobe-bridge"],
  { cwd: root, encoding: "utf8" },
).match(/([a-f0-9]{40})/)?.[1];

const slices = [
  run("format", "pnpm", ["format:check"]),
  run("typecheck", "pnpm", ["typecheck"], { timeoutMs: 180_000 }),
  run("openapi", "pnpm", ["contracts:openapi:check"]),
  run("assert-evidence", "node", ["scripts/qa/assert-evidence.mjs"]),
  run("assets", "pnpm", ["assets:verify"]),
  run("recovery", "pnpm", ["recovery:test"], { timeoutMs: 180_000 }),
  run("handoff", "pnpm", ["handoff:verify"], { timeoutMs: 180_000 }),
  run("security", "pnpm", ["test:security"], { timeoutMs: 180_000 }),
  run(
    "contracts",
    "pnpm",
    ["--filter", "@rvs/contracts", "exec", "vitest", "run"],
    {
      timeoutMs: 180_000,
    },
  ),
  run("api", "pnpm", ["--filter", "@rvs/api", "exec", "vitest", "run"], {
    timeoutMs: 300_000,
  }),
  run("web-unit", "pnpm", ["--filter", "@rvs/web", "exec", "vitest", "run"], {
    timeoutMs: 180_000,
  }),
  run("worker", "pnpm", ["test", "--run"], {
    cwd: resolve(root, "apps/worker"),
    timeoutMs: 180_000,
  }),
  run("adobe-check", "bun", ["run", "check"], {
    cwd: resolve(root, "integrations/adobe-bridge"),
    timeoutMs: 180_000,
  }),
  run("adobe-test", "bun", ["test", "--timeout", "60000"], {
    cwd: resolve(root, "integrations/adobe-bridge"),
    timeoutMs: 180_000,
  }),
];

const report = [
  "# P7.1 automated gate",
  "",
  `- date: ${new Date().toISOString()}`,
  `- root: \`${implementationCommit}\``,
  `- worker: \`${worker}\``,
  `- adobe: \`${adobe}\``,
  `- dir: \`${dir}\``,
  "",
  "| Slice | Status | Elapsed |",
  "| --- | --- | --- |",
  ...slices.map(
    (slice) =>
      `| \`${slice.label}\` | ${slice.status} | ${Math.round(slice.elapsedMs / 1000)}s |`,
  ),
  "",
  slices.every((slice) => slice.status === "PASS")
    ? "**Verdict:** PASS (P4.8 real AE still host-blocked; not part of this stamp)."
    : "**Verdict:** PARTIAL — failing slices recorded below.",
  "",
  ...slices
    .filter((slice) => slice.status === "FAIL")
    .flatMap((slice) => [
      `## FAIL ${slice.label}`,
      "",
      "```",
      slice.stdout,
      "```",
      "",
    ]),
].join("\n");

await writeFile(resolve(dir, "REPORT.md"), `${report}\n`);
await writeFile(
  resolve(dir, "meta.txt"),
  `root=${implementationCommit}\nworker=${worker}\nadobe=${adobe}\nfinished=${new Date().toISOString()}\n`,
);
for (const slice of slices)
  await writeFile(resolve(dir, `${slice.label}.log`), slice.stdout);
process.stdout.write(
  `${JSON.stringify({ dir, slices: slices.map((s) => [s.label, s.status]) })}\n`,
);
process.exit(slices.every((slice) => slice.status === "PASS") ? 0 : 1);
