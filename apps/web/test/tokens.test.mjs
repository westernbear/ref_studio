import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../..");
const tokens = readFileSync(
  resolve(root, "apps/web/src/styles/tokens.css"),
  "utf8",
);
describe("token surface", () => {
  it("keeps referenced canvas, ink, and type faces", () => {
    expect(tokens).toContain("/fonts/Manrope-Variable.ttf");
    expect(tokens).toContain("/fonts/InterVariable.woff2");
    expect(tokens).toContain("/fonts/GeistMono-Variable.woff2");
    expect(tokens).toContain("--color-canvas");
    expect(tokens).toContain("--color-ink");
    expect(tokens).toContain("--type-body-sm");
  });
  it("drops unused faces, Material You dump, component aliases, and dusk/accent tokens", () => {
    expect(tokens).not.toContain("/fonts/WantedSansVariable.ttf");
    expect(tokens).not.toContain("/fonts/Geist-Variable.woff2");
    expect(tokens).not.toContain("--font-korean");
    expect(tokens).not.toContain("--component-");
    expect(tokens).not.toContain("--color-dusk");
    expect(tokens).not.toContain("--color-accent-dusk");
    expect(tokens).not.toContain("--color-accent-twilight");
    expect(tokens).not.toContain("@theme inline");
  });
});
