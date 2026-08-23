import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { resolve } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { appendEvidence } from "../../verification/blackbox/evidence-writer.mjs"

const run = promisify(execFile)
const workspace = resolve(import.meta.dirname, "../..")
const temp = await mkdtemp(`${tmpdir()}/rvs-qa-`)
const lock = resolve(workspace, "verification/contract-lock.json")
const root = resolve(workspace, ".omo/drafts/reference-video-studio-saas-verifier-root.md")
const fixture = (name) => resolve(workspace, `scripts/qa/fixtures/harness/${name}.json`)
const expectFailure = async (name, action, token) => {
  try { await action(); throw new Error(`${name}: expected failure`) } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}${error.message ?? ""}`
    if (!output.includes(token)) throw new Error(`${name}: missing ${token}; output=${output}`)
  }
}
const writeFixture = async (name, value) => { const path = resolve(temp, name); await writeFile(path, JSON.stringify(value)); return path }

const drift = resolve(temp, "drift.json")
await writeFile(drift, (await readFile(lock, "utf8")).replace('"controlCount": 151', '"controlCount": 150'))
await expectFailure("root/parent drift", () => run("node", ["verification/blackbox/verify-contract.mjs", "--lock", drift, "--verifier-root", root], { cwd: workspace }), "CONTROL_COVERAGE_INVALID")
const parentDrift = resolve(temp, "parent-drift.json")
await writeFile(parentDrift, (await readFile(lock, "utf8")).replace(/"parentRootSha256": "[^"]+"/, '"parentRootSha256": "deadbeef"'))
await expectFailure("parent drift", () => run("node", ["verification/blackbox/verify-contract.mjs", "--lock", parentDrift, "--verifier-root", root], { cwd: workspace }), "VERIFIER_ROOT_DRIFT")
const rootDrift = resolve(temp, "root-drift.md")
await writeFile(rootDrift, (await readFile(root, "utf8")).replace(/"contractLockSha256": "[^"]+"/, '"contractLockSha256": "deadbeef"'))
await expectFailure("verifier-root drift", () => run("node", ["verification/blackbox/verify-contract.mjs", "--lock", lock, "--verifier-root", rootDrift], { cwd: workspace }), "VERIFIER_ROOT_DRIFT")
const malformed = resolve(temp, "malformed-evidence.json"); await writeFile(malformed, "{")
await expectFailure("malformed evidence", () => appendEvidence(resolve(temp, "malformed-index.jsonl"), malformed, {}), "EVIDENCE_INVALID")
const falsePass = JSON.parse(await readFile(fixture("false-pass"), "utf8")); falsePass.taskId = "T3"; falsePass.assertions = [{ status: "PASS" }]
const falsePassPath = await writeFixture("false-pass-evidence.json", falsePass)
await expectFailure("false PASS", () => appendEvidence(resolve(temp, "false-index.jsonl"), falsePassPath, {}), "MISLEADING_SUCCESS_OUTPUT")
const stale = JSON.parse(await readFile(fixture("stale-evidence"), "utf8")); stale.taskId = "T3"; stale.assertions = [{ status: "PASS" }]; stale.claimedStatus = "PASS"; stale.exitCode = 0
const stalePath = await writeFixture("stale-evidence.json", stale)
await expectFailure("stale evidence", () => appendEvidence(resolve(temp, "stale-index.jsonl"), stalePath, {}), "STALE_EVIDENCE")
const validatorCrash = JSON.parse(await readFile(fixture("validator-crash"), "utf8")); validatorCrash.taskId = "T3"; validatorCrash.status = "PASS"; validatorCrash.claimedStatus = "PASS"; validatorCrash.exitCode = 0; validatorCrash.assertions = [{ status: "ERROR" }]
const validatorPath = await writeFixture("validator-crash-evidence.json", validatorCrash)
await expectFailure("validator crash", () => appendEvidence(resolve(temp, "validator-index.jsonl"), validatorPath, {}), "EVIDENCE_INVALID")
const misleading = JSON.parse(await readFile(fixture("misleading-pass"), "utf8")); misleading.taskId = "T3"; misleading.assertions = [{ status: "PASS" }]
const misleadingPath = await writeFixture("misleading-pass-evidence.json", misleading)
await expectFailure("misleading pass", () => appendEvidence(resolve(temp, "misleading-index.jsonl"), misleadingPath, {}), "MISLEADING_SUCCESS_OUTPUT")
const valid = { taskId: "T3-smoke", status: "PASS", claimedStatus: "PASS", exitCode: 0, assertions: [{ name: "writer", status: "PASS" }] }
const validPath = await writeFixture("valid-evidence.json", valid); const validIndex = resolve(temp, "valid-index.jsonl")
await appendEvidence(validIndex, validPath, { scenario: "valid-writer-smoke", command: "self-test" })
const parser = await run("node", ["scripts/qa/assert-evidence.mjs", validIndex], { cwd: workspace })
if (!parser.stdout.includes('"status":"PASS"')) throw new Error("EVIDENCE_PARSER_REJECTED_VALID")
const forbidden = JSON.parse(await readFile(fixture("forbidden-import"), "utf8")); await expectFailure("forbidden import", () => { if (!forbidden.allowedPrefixes.some((prefix) => forbidden.importPath.startsWith(prefix))) throw new Error("FORBIDDEN_IMPORT") }, "FORBIDDEN_IMPORT")
const alias = JSON.parse(await readFile(fixture("alias-audit"), "utf8")); await expectFailure("alias audit", () => { const operationKeys = alias.operations.map(({ method, path }) => `${method} ${path}`); if (new Set(operationKeys).size !== operationKeys.length) throw new Error("ALIAS_AUDIT_FAILED") }, "ALIAS_AUDIT_FAILED")
const schema = resolve(temp, "bad-api.json"); await writeFile(schema, JSON.stringify({ schemaVersion: "rvs-api-action-contract-v3", operations: [{ key: "GET" }] }))
await expectFailure("schema/coverage errors", () => run("node", ["verification/blackbox/freeze-contract.mjs", "--source", ".omo/plans/reference-video-studio-saas.md", "--normative", ".omo/drafts/reference-video-studio-saas-normative-inputs.json", "--supply", ".omo/drafts/reference-video-studio-saas-supply-chain.json", "--controls", ".omo/drafts/reference-video-studio-saas-control-contract.jsonl", "--api-actions", schema, "--verification", ".omo/drafts/reference-video-studio-saas-verification-contract.json", "--emit-verifier-root", root], { cwd: workspace }), "OPENAPI_OPERATION_INVALID")
process.stdout.write(`${JSON.stringify({ status: "PASS", negativeCases: ["root/parent drift", "verifier-root drift", "forbidden import", "alias audit", "schema/coverage errors", "malformed fixture", "false PASS", "stale evidence", "validator crash", "misleading pass"], validEvidence: "written-and-parsed" })}\n`)
