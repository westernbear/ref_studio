import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
const root = resolve(import.meta.dirname, "../..")
const oracle = (await readFile(resolve(root, ".omo/drafts/reference-video-studio-saas-control-contract.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
const evidence = JSON.parse(await readFile(resolve(root, ".omo/evidence/wave7/task-41-reference-video-studio-saas.json"), "utf8"))
const expected = new Set(oracle.map((row) => row.id)); const actual = new Set(evidence.controls)
if (evidence.status !== "passed" || expected.size !== 151 || actual.size !== expected.size || [...expected].some((id) => !actual.has(id))) throw new Error("CONTROL_COVERAGE_MISMATCH")
process.stdout.write("151/151\n")
