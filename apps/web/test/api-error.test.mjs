import { describe, expect, it } from "vitest";
import { errorCode } from "../src/lib/api-error.ts";

describe("API error code", () => {
  it("reads a string code from the live API error envelope", () => {
    expect(errorCode({ error: { code: "VERSION_CONFLICT" } })).toBe(
      "VERSION_CONFLICT",
    );
  });

  it("falls back to an empty string outside the error envelope", () => {
    expect(
      [null, {}, { error: null }, { error: { code: 409 } }].map(errorCode),
    ).toEqual(["", "", "", ""]);
  });
});
