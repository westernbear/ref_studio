import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const messages = (name) =>
  JSON.parse(
    readFileSync(
      resolve(import.meta.dirname, `../messages/${name}.json`),
      "utf8",
    ),
  ).MotionWorkspace;
const en = messages("en-US");
const ko = messages("ko-KR");

const leaves = (value, path = "") =>
  Object.entries(value).flatMap(([key, child]) => {
    const next = path ? `${path}.${key}` : key;
    return child && typeof child === "object" ? leaves(child, next) : [next];
  });

describe("motion workspace localization", () => {
  it("keeps every EN workspace state, remediation, and error localized in Korean", () => {
    expect(leaves(ko).sort()).toEqual(leaves(en).sort());
    for (const state of [
      "initial",
      "loading",
      "empty",
      "unsupported",
      "error",
      "conflict",
      "repair",
      "queued",
      "running",
      "success",
      "partial",
      "cancelled",
      "offline",
    ]) {
      expect(ko.states[state].title).toBeTruthy();
      expect(ko.states[state].detail).toBeTruthy();
    }
    expect(ko.errors.unknown).toContain("{code}");
    expect(en.errors.unknown).toContain("{code}");
  });
});
