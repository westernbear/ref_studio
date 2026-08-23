import { spawn } from "node:child_process";
import { resolve } from "node:path";

const args = process.argv
  .slice(2)
  .filter((arg) => arg !== "--rules" && !arg.endsWith("wcag-aa.json"));
const child = spawn(
  "pnpm",
  ["exec", "playwright", "test", "test/a11y.e2e.spec.ts", ...args],
  { stdio: "inherit", cwd: resolve(import.meta.dirname, "..") },
);
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
