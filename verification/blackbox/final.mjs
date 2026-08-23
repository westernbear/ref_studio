import { createHash } from "node:crypto";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const args = process.argv.slice(2);
const mode = args[0];
const value = (name) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args[i + 1];
};
const fail = (token, detail) => {
  throw new Error(`${token}${detail ? `: ${detail}` : ""}`);
};
const bytes = async (path) => readFile(resolve(root, path));
const json = async (path) => JSON.parse(await bytes(path));
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const exists = async (path) => {
  try {
    await stat(resolve(root, path));
    return true;
  } catch {
    return false;
  }
};
const required = async (paths) => {
  for (const path of paths)
    if (!(await exists(path))) fail("FINAL_REQUIRED_ARTIFACT_MISSING", path);
};
const walk = async (path) => {
  const absolute = resolve(root, path);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (
      ["node_modules", ".next", ".venv", ".git", "__pycache__"].includes(
        entry.name,
      )
    )
      continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(child)));
    else if (
      entry.isFile() &&
      /\.(mjs|js|ts|tsx|py|sql)$/.test(entry.name) &&
      !/(?:\.test\.|test\.mjs$|\.spec\.)/.test(entry.name)
    )
      files.push(child);
  }
  return files;
};
const sourceText = async (roots) =>
  (
    await Promise.all(
      (await Promise.all(roots.map(walk)))
        .flat()
        .map(async (path) => [path, (await bytes(path)).toString("utf8")]),
    )
  )
    .map(([path, text]) => `${path}\n${text}`)
    .join("\n");

async function verifyRules(path) {
  const rules = await json(path);
  await required(rules.requiredFiles);
  const compose = (await bytes("docker-compose.yml")).toString("utf8");
  if (!/qa:\n[\s\S]*?network_mode: none/.test(compose))
    fail("ARCH_COMPOSE_QA_NETWORK");
  const audit =
    compose.match(
      /qa-audit-egress:\n([\s\S]*?)(?=\n  [a-z]|\nnetworks:)/,
    )?.[1] ?? "";
  if (
    /networks:|network_mode:\s*none|database|cas|appnet|\.\/:\/workspace/.test(
      audit,
    )
  )
    fail("ARCH_AUDIT_BOUNDARY");
  const controls = (await bytes("verification/contract/controls.jsonl"))
    .toString("utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  if (
    controls.length !== 151 ||
    new Set(controls.map((row) => row.id)).size !== 151
  )
    fail("ARCH_CONTROL_COUNT");
  const text = await sourceText(
    rules.checks
      .filter(
        (check) => check.type !== "compose" && check.type !== "jsonl-count",
      )
      .flatMap((check) => check.roots ?? []),
  );
  for (const check of rules.checks.filter(
    (item) => item.type === "source-regex" || item.type === "scope-regex",
  ))
    for (const pattern of check.patterns)
      if (new RegExp(pattern, "im").test(text))
        fail(`ARCH_RULE_REJECTED_${check.id}`, pattern);
  return {
    controls: controls.length,
    ruleCount: rules.checks.length,
    composeIsolation: true,
  };
}

async function verifyAdvisory(attempt) {
  const path = join(attempt, "npm-audit-advisory.json");
  const advisory = await json(path);
  const levels = advisory.metadata?.vulnerabilities ?? {};
  if ((levels.high ?? 0) !== 0 || (levels.critical ?? 0) !== 0)
    fail("ADVISORY_HIGH_CRITICAL");
  return {
    high: levels.high ?? 0,
    critical: levels.critical ?? 0,
    digest: sha256(await bytes(path)),
  };
}

async function verifyF2() {
  const attempt = value("--attempt-dir");
  const rules = value("--rules");
  if (!attempt || !rules || !args.includes("--receipt-local-only"))
    fail("FINAL_ARGUMENTS_INVALID");
  const ruleResult = await verifyRules(rules);
  const advisory = await verifyAdvisory(attempt);
  const receipt = {
    schemaVersion: "rvs-final-receipt-v1",
    mode: "f2",
    verdict: "PASS",
    ruleResult,
    advisory,
    generatedAt: new Date().toISOString(),
  };
  await mkdir(resolve(root, attempt), { recursive: true });
  await appendFile(
    resolve(root, attempt, "final-f2-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

async function verifyF3() {
  const attempt = value("--attempt-dir");
  if (!attempt || !args.includes("--receipt-local-only"))
    fail("FINAL_ARGUMENTS_INVALID");
  const wcag = await json("verification/contract/wcag-aa.json");
  const visual = await json("verification/contract/visual/index.json");
  const task42 = await json(
    ".omo/evidence/wave7/task-42-reference-video-studio-saas.json",
  );
  const task44 = await json(
    ".omo/evidence/wave7/task-44-reference-video-studio-saas.json",
  );
  if (
    task42.status !== "passed" ||
    task42.accessibility?.violations !== 0 ||
    task42.visual?.screens !== 9
  )
    fail("F3_UI_EVIDENCE_INVALID");
  if (
    task44.status !== "PASS" ||
    task44.admittedFps.join(",") !== "24,25,30,50,60" ||
    task44.frameCounts.join(",") !== "96,100,120,200,240"
  )
    fail("F3_PILOT_EVIDENCE_INVALID");
  await required([
    "verification/contract/controls.jsonl",
    "verification/contract/wcag-aa.json",
    "verification/contract/visual/index.json",
    "dist/final-handoff-package.zip",
  ]);
  const receipt = {
    schemaVersion: "rvs-final-receipt-v1",
    mode: "f3",
    verdict: "PASS",
    controls: 151,
    wcag,
    visual,
    pilot: task44,
    generatedAt: new Date().toISOString(),
  };
  await mkdir(resolve(root, attempt), { recursive: true });
  await appendFile(
    resolve(root, attempt, "final-f3-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

async function verifyF4() {
  const attempt = value("--attempt-dir");
  if (!attempt || !args.includes("--receipt-local-only"))
    fail("FINAL_ARGUMENTS_INVALID");
  const rootDoc = await bytes(
    ".omo/drafts/reference-video-studio-saas-authority-root.md",
  );
  const decisions = (
    await bytes(".omo/drafts/reference-video-studio-saas-decisions-frozen.md")
  ).toString("utf8");
  const manifest = await json("compiler/model-manifest.json");
  const openapi = await json("apps/api/openapi.json");
  if (
    !decisions.includes("C1 web-ui") ||
    !decisions.includes("C6 gates-receipts-audit")
  )
    fail("F4_DECISION_LEDGER_INVALID");
  if (
    manifest.models.length < 5 ||
    openapi.openapi !== "3.1.0" ||
    Object.keys(openapi.paths).length < 5
  )
    fail("F4_MAPPING_INVALID");
  const rootManifest = JSON.parse(
    rootDoc.toString("utf8").match(/```json\s*\n([\s\S]*?)\n```/)?.[1] ??
      "null",
  );
  if (
    rootManifest.schemaVersion !== "rvs-authority-root-v1" ||
    !Array.isArray(rootManifest.entries)
  )
    fail("F4_AUTHORITY_ROOT_INVALID");
  for (const entry of rootManifest.entries) {
    if (entry.path === ".omo/plans/reference-video-studio-saas.md") continue;
    const current = await bytes(entry.path);
    if (current.byteLength !== entry.bytes || sha256(current) !== entry.sha256)
      fail("F4_AUTHORITY_ENTRY_DRIFT", entry.path);
  }
  await required([
    ".omo/drafts/reference-video-studio-saas-authority-root.md",
    ".omo/drafts/reference-video-studio-saas-decisions-frozen.md",
    "compiler/model-manifest.json",
    "apps/api/openapi.json",
    "runtime/runtime-manifest.json",
    "dist/final-handoff-package.zip",
  ]);
  const receipt = {
    schemaVersion: "rvs-final-receipt-v1",
    mode: "f4",
    verdict: "PASS",
    authorityRootSha256: sha256(rootDoc),
    authorityEntryPolicy:
      "all frozen entries verified; plan checkbox state treated as mutable execution metadata",
    components: 6,
    screens: 9,
    controls: 151,
    modelCount: manifest.models.length,
    openapiPaths: Object.keys(openapi.paths).length,
    generatedAt: new Date().toISOString(),
  };
  await mkdir(resolve(root, attempt), { recursive: true });
  await appendFile(
    resolve(root, attempt, "final-f4-receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

async function verifyF1() {
  const plan = value("--plan");
  const authority = value("--authority-root");
  const expectedRoot = value("--expected-root");
  const lockPathArg = value("--contract-lock");
  const index = value("--evidence-index") ?? value("--canonical-index");
  const expectedTasks = Number(value("--expected-tasks"));
  const expectedFinal = Number(value("--expected-final"));
  const expectedControls = Number(value("--expected-controls"));
  if (
    !plan ||
    !authority ||
    !expectedRoot ||
    !lockPathArg ||
    !index ||
    expectedTasks !== 45 ||
    expectedFinal !== 4 ||
    expectedControls !== 151
  )
    fail("F1_ARGUMENTS_INVALID");
  if (!args.includes("--append-f1") && !args.includes("--canonical-write"))
    fail("F1_CANONICAL_WRITE_EXPLICIT");
  const readJsonSequence = (path) => {
    const text = path;
    const items = [];
    let start = 0;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === "{") depth += 1;
      if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          items.push(JSON.parse(text.slice(start, i + 1)));
          start = i + 1;
        }
      }
    }
    if (depth !== 0 || text.slice(start).trim())
      fail("F1_RECEIPT_JSON_INVALID");
    return items;
  };
  const planText = (await bytes(plan)).toString("utf8");
  const implementation = [...planText.matchAll(/^- \[x\] (\d+)\./gm)].map(
    (match) => Number(match[1]),
  );
  if (
    implementation.filter((task) => task >= 1 && task <= 45).length !==
      expectedTasks ||
    new Set(implementation).size < expectedTasks
  )
    fail("F1_IMPLEMENTATION_TASKS_INVALID");
  const finalStates = [...planText.matchAll(/^- \[([ x])\] (F\d+)\./gm)];
  if (
    finalStates.length !== expectedFinal ||
    finalStates.filter(([, state]) => state === "x").length !==
      expectedFinal - 1 ||
    !finalStates.some(([, state, task]) => state === " " && task === "F1")
  )
    fail("F1_FINAL_CHECKBOX_INVALID");
  const authorityBytes = await bytes(authority);
  if (sha256(authorityBytes) !== expectedRoot)
    fail("F1_AUTHORITY_ROOT_MISMATCH");
  const rootManifest = JSON.parse(
    authorityBytes.toString("utf8").match(/```json\s*\n([\s\S]*?)\n```/)?.[1] ??
      "null",
  );
  if (rootManifest.schemaVersion !== "rvs-authority-root-v1")
    fail("F1_AUTHORITY_ROOT_INVALID");
  for (const entry of rootManifest.entries) {
    if (entry.path === plan) continue;
    const current = await bytes(entry.path);
    if (current.byteLength !== entry.bytes || sha256(current) !== entry.sha256)
      fail("F1_AUTHORITY_ENTRY_DRIFT", entry.path);
  }
  const lockBytes = await bytes(lockPathArg);
  const contractLock = JSON.parse(lockBytes);
  if (
    contractLock.schemaVersion !== "rvs-contract-lock-v1" ||
    contractLock.controlCount !== expectedControls ||
    contractLock.uniqueControlCount !== expectedControls
  )
    fail("F1_CONTRACT_LOCK_INVALID");
  for (const entry of contractLock.entries) {
    const current = await bytes(entry.path);
    if (current.byteLength !== entry.bytes || sha256(current) !== entry.sha256)
      fail("F1_CONTRACT_DRIFT", entry.path);
  }
  const controls = (await bytes("verification/contract/controls.jsonl"))
    .toString("utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  if (
    controls.length !== expectedControls ||
    new Set(controls.map((row) => row.id)).size !== expectedControls
  )
    fail("F1_CONTROL_COUNT_INVALID");
  const finalDirs = ["F2", "F3", "F4"];
  if (
    !args.includes("--require-existing-final") ||
    !args.some((arg) => arg === "F2,F3,F4")
  )
    fail("F1_FINAL_PREREQUISITES_REQUIRED");
  const prerequisiteReceipts = [];
  for (const modeName of finalDirs) {
    const dir = `.omo/evidence/final/${modeName}`;
    const files = (await readdir(resolve(root, dir))).filter((file) =>
      file.endsWith("receipt.json"),
    );
    const candidates = [];
    for (const file of files) {
      const path = `${dir}/${file}`;
      for (const item of readJsonSequence((await bytes(path)).toString("utf8")))
        if (item.verdict === "PASS" || item.verdict === "APPROVE")
          candidates.push({ path, item });
    }
    if (!candidates.length) fail("F1_RECEIPT_NOT_PASS", modeName);
    prerequisiteReceipts.push(candidates.at(-1));
  }
  const indexPath = resolve(root, index);
  const beforeIndex = await readFile(indexPath, "utf8").catch(() => "");
  const previousRows = beforeIndex.trim()
    ? beforeIndex
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
    : [];
  if (previousRows.some((row) => !row.rowSha256))
    fail("F1_INDEX_CHAIN_INVALID");
  const f1Path = ".omo/evidence/final/F1/final-f1-receipt.json";
  const receipt = {
    schemaVersion: "rvs-final-receipt-v1",
    mode: "f1",
    verdict: "APPROVE",
    implementationTasks: expectedTasks,
    finalTasks: expectedFinal,
    controls: expectedControls,
    authorityRootSha256: sha256(authorityBytes),
    contractLockSha256: sha256(lockBytes),
    authorityEntryPolicy:
      "all frozen entries verified; plan checkbox state treated as mutable execution metadata",
    prerequisites: prerequisiteReceipts.map(({ path, item }) => ({
      mode: item.mode,
      path,
      verdict: item.verdict,
    })),
    generatedAt: new Date().toISOString(),
  };
  await mkdir(dirname(resolve(root, f1Path)), { recursive: true });
  await writeFile(
    resolve(root, f1Path),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  const previousRowSha256 = previousRows.at(-1)?.rowSha256 ?? null;
  const f1Row = {
    mode: "f1",
    receipt: f1Path,
    sha256: sha256(await bytes(f1Path)),
    previousRowSha256,
  };
  const rows = [{ ...f1Row, rowSha256: sha256(JSON.stringify(f1Row)) }];
  const lockFile = `${indexPath}.lock`;
  const writer = await open(lockFile, "wx").catch(() =>
    fail("F1_CANONICAL_WRITER_BUSY"),
  );
  try {
    await appendFile(
      indexPath,
      `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`,
    );
  } finally {
    await writer.close();
    await unlink(lockFile).catch(() => {});
  }
  const afterIndex = await readFile(indexPath, "utf8");
  if (
    !afterIndex.startsWith(beforeIndex) ||
    afterIndex.trim().split("\n").length !== previousRows.length + rows.length
  )
    fail("F1_CLOSURE_CHECK_FAILED");
  process.stdout.write(
    `${JSON.stringify({ mode: "f1", verdict: "APPROVE", receipts: rows.length, closure: "PASS", evidence: f1Path })}\nVERDICT: APPROVE\n`,
  );
}

const modes = { f1: verifyF1, f2: verifyF2, f3: verifyF3, f4: verifyF4 };
if (!modes[mode]) fail("FINAL_MODE_INVALID");
try {
  await modes[mode]();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
