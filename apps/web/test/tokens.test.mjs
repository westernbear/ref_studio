import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

const root = resolve(import.meta.dirname, "../../..")
const design = readFileSync(resolve(root, "stitch-extracted/stitch_design_system_ui_implementation/cosmic_engineering/DESIGN.md"), "utf8")
const tokens = readFileSync(resolve(root, "apps/web/src/styles/tokens.css"), "utf8")
const names = [...design.matchAll(/^\s{2}([a-z][a-z0-9-]*):/gm)].map((match) => match[1]).filter((name) => !["colors", "typography", "rounded", "spacing", "components"].includes(name))
describe("Cosmic Engineering token coverage", () => {
  it("maps every authoritative token to a CSS variable", () => {
    const missing = [...new Set(names)].filter((name) => !tokens.includes(`--color-${name}`) && !tokens.includes(`--space-${name}`) && !tokens.includes(`--radius-${name}`) && !tokens.includes(`--font-${name}`) && !tokens.includes(`--type-${name}`) && !tokens.includes(`--component-${name}`))
    expect(missing).toEqual([])
  })
  it("includes local Korean-capable Wanted Sans", () => expect(tokens).toContain("/fonts/WantedSansVariable.ttf"))
})
