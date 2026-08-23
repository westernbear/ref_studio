import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const manifest = JSON.parse(
  readFileSync(resolve(root, "tests/control-manifest.json"), "utf8"),
);
const primitives = readFileSync(
  resolve(root, "apps/web/src/components/Primitives.tsx"),
  "utf8",
);
describe("shared control contract projection", () => {
  it("projects exactly 151 unique source controls", () => {
    expect(manifest.controls).toHaveLength(151);
    expect(new Set(manifest.controls.map((control) => control.id)).size).toBe(
      151,
    );
  });
  it("preserves executable control fields and projection metadata", () => {
    for (const control of manifest.controls) {
      for (const field of ["id", "action", "path", "state", "result"])
        expect(control[field]).toBeTruthy();
      expect(control.selector).toContain(control.id);
    }
  });
  it("uses semantic disabled behavior and visible focus", () => {
    expect(primitives).toContain("disabled={isDisabled}");
    expect(
      readFileSync(resolve(root, "apps/web/src/styles/primitives.css"), "utf8"),
    ).toContain(":focus-visible");
  });
});
