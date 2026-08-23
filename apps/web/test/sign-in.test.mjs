import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const source = readFileSync(
  resolve(root, "apps/web/src/components/SignInForm.tsx"),
  "utf8",
);

describe("shared sign-in contract", () => {
  it("uses safe API destinations and rejects external return paths", () => {
    expect(source).toContain("isSafeReturnUrl");
    expect(source).toContain('!value.startsWith("//")');
    expect(source).toContain("window.location.assign(destination)");
  });

  it("preserves only the identifier and clears the secret after failures", () => {
    expect(source).toContain("value={identifier}");
    expect(source).toContain('setSecret("")');
    expect(source).toContain("secretRef.current?.focus()");
  });

  it("keeps accessible form and duplicate-submit behavior", () => {
    expect(source).toContain("onSubmit={submit}");
    expect(source).toContain('type="submit"');
    expect(source).toContain("if (busy) return");
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('type="button"');
  });
});
