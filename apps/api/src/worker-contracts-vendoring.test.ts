import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// apps/worker is a standalone deployable submodule -- own Dockerfile, own
// pnpm-lock.yaml, and a pnpm-workspace.yaml whose packages list is empty --
// so it cannot depend on packages/contracts through the workspace protocol:
// a clean container build's `pnpm install --frozen-lockfile` has no
// importer entry to resolve "workspace:*" against (apps/worker/Dockerfile).
// Six pure modules are instead vendored, byte-for-byte, into
// apps/worker/src/contracts/. The submodule's own build context cannot see
// packages/contracts, so a drift test cannot live inside apps/worker; this
// suite is the one place both copies are visible. If this fails, the fix is
// to re-copy the named file's body from packages/contracts/src into the
// matching file under apps/worker/src/contracts, unmodified.
const VENDORED_MODULES = [
  "generation.ts",
  "scene-spec.ts",
  "scene-spec.fixture.ts",
  "spec-validate.ts",
  "scene-assets.ts",
  "canonical-json.ts",
] as const;

// Every vendored file's header comment ends with this exact line, followed
// by one blank separator line and then the unmodified body copied from
// packages/contracts/src. Stripping up through the blank line is what lets
// this test compare bodies only, ignoring the header this task added.
const VENDOR_HEADER_SENTINEL = "// ---- vendored copy below, unmodified ----";

function stripVendorHeader(source: string, path: string): string {
  const lines = source.split("\n");
  const sentinelIndex = lines.indexOf(VENDOR_HEADER_SENTINEL);
  if (sentinelIndex === -1 || lines[sentinelIndex + 1] !== "") {
    throw new Error(
      `${path} is missing the expected vendor header sentinel line ` +
        `(${JSON.stringify(VENDOR_HEADER_SENTINEL)} followed by a blank line). ` +
        "Do not remove the header; it is what lets this drift test compare bodies only.",
    );
  }
  return lines.slice(sentinelIndex + 2).join("\n");
}

const originalPath = (name: string): string =>
  fileURLToPath(
    new URL(`../../../packages/contracts/src/${name}`, import.meta.url),
  );
const vendoredPath = (name: string): string =>
  fileURLToPath(
    new URL(`../../../apps/worker/src/contracts/${name}`, import.meta.url),
  );

describe("apps/worker's vendored copy of packages/contracts", () => {
  for (const name of VENDORED_MODULES) {
    it(`${name} is byte-for-byte identical to packages/contracts/src/${name}`, () => {
      const original = readFileSync(originalPath(name), "utf8");
      const vendored = stripVendorHeader(
        readFileSync(vendoredPath(name), "utf8"),
        `apps/worker/src/contracts/${name}`,
      );
      expect(
        vendored,
        `apps/worker/src/contracts/${name} has drifted from packages/contracts/src/${name}. ` +
          `Fix: re-copy the file body from packages/contracts/src/${name} into ` +
          `apps/worker/src/contracts/${name}, keeping that file's existing vendor header comment unchanged.`,
      ).toBe(original);
    });
  }
});
