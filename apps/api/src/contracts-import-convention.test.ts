import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// packages/contracts/package.json's main/types/exports all point at
// ./src/index.ts -- TypeScript source. That resolution is exactly what
// vitest (which transpiles on the fly) and `tsc --noEmit` (which only
// resolves types) both want, so packages/contracts/package.json must stay
// pointed at the .ts source and is not touched here.
//
// But a *built* apps/api file is plain compiled JS run by Node's real ESM
// loader. TypeScript does not rewrite the bare specifier "@rvs/contracts",
// so it survives into dist/apps/api/src/<file>.js unchanged. At runtime
// Node resolves that bare specifier through node_modules/@rvs/contracts ->
// packages/contracts/package.json -> ./src/index.ts, and then tries to load
// that TypeScript file as if it were JavaScript. index.ts's first line,
// `export * from "./ids.js"`, then fails to find a sibling ids.js next to
// the .ts source, and Node dies with ERR_MODULE_NOT_FOUND -- a crash loop
// that only ever shows up in the built container, never under vitest.
//
// The runtime convention every other file in apps/api/src follows instead
// (see boundary.ts, auth.ts) is a relative deep import straight into the
// compiled sibling output: "../../../packages/contracts/src/<module>.js".
// apps/api/tsconfig.json sets rootDir to the repo root, so `tsc` emits
// dist/packages/contracts/src/<module>.js right beside apps/api's own
// dist output, and that relative import resolves at runtime with no
// package.json indirection at all.
//
// This test enforces that convention for every non-test file under
// apps/api/src. Test files are deliberately exempt: vitest resolves the
// bare specifier correctly, so author-scene.test.ts and workers.test.ts
// are allowed to keep using it.

const SRC_ROOT = fileURLToPath(new URL(".", import.meta.url));
const BARE_SPECIFIER = "@rvs/contracts";

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(`${dir}/${entry.name}`));
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
      continue;
    }
    files.push(`${dir}/${entry.name}`);
  }
  return files;
}

describe("apps/api/src runtime files import @rvs/contracts by relative deep import, not bare specifier", () => {
  it("no non-test file imports the bare '@rvs/contracts' specifier", () => {
    const offenders = listSourceFiles(SRC_ROOT.replace(/\/$/, "")).filter(
      (path) => {
        const source = readFileSync(path, "utf8");
        return (
          source.includes(`"${BARE_SPECIFIER}"`) ||
          source.includes(`'${BARE_SPECIFIER}'`)
        );
      },
    );

    expect(
      offenders,
      "The following non-test files under apps/api/src import the bare " +
        `"${BARE_SPECIFIER}" specifier: ${JSON.stringify(offenders)}. ` +
        "This builds fine under vitest and `tsc --noEmit`, but crash-loops " +
        "the real container: packages/contracts/package.json's main/types/" +
        "exports resolve @rvs/contracts to ./src/index.ts (TypeScript " +
        "source), which Node's ESM loader cannot execute -- it fails on " +
        "index.ts's own `export * from \"./ids.js\"` with " +
        "ERR_MODULE_NOT_FOUND, because there is no compiled ids.js beside " +
        "the TypeScript source. Fix: replace the bare import with a " +
        "relative deep import into the compiled sibling output, matching " +
        "every other file in apps/api/src (see boundary.ts, auth.ts): " +
        '`from "../../../packages/contracts/src/<module>.js"`. ' +
        "apps/api/tsconfig.json's rootDir emits that file at " +
        "dist/packages/contracts/src/<module>.js right next to apps/api's " +
        "own compiled output, so the relative import resolves at runtime " +
        "with no package.json indirection.",
    ).toEqual([]);
  });
});
