import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  JOB_CREATE_REASONS,
  reasonKeyFor,
} from "../src/lib/job-create-reasons.ts";

const messages = (locale) =>
  JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).ProjectsNew
    .reason;

// Every refusal POST /v1/jobs can return. Written out rather than derived,
// because deriving it from the API package would make this test pass by
// construction -- the point is that adding a refusal over there forces
// someone to come here and say what it means to a creator.
const JOB_CREATE_REFUSALS = [
  "VIDEO_TYPE_INVALID",
  "VIDEO_SIZE_LIMIT_EXCEEDED",
  "UPLOAD_QUARANTINED",
  "MEDIA_VFR_UNSUPPORTED",
  "MEDIA_DURATION_INVALID",
  "MEDIA_INTERVAL_INVALID",
  "INVALID_REQUEST",
  "TENANT_BOUNDARY_BYPASS",
  "RESOURCE_NOT_FOUND",
  "ATTACHMENT_TYPE_INVALID",
  "ATTACHMENT_SIZE_LIMIT_EXCEEDED",
  "ATTACHMENT_COUNT_LIMIT_EXCEEDED",
  "ATTACHMENT_QUOTA_EXCEEDED",
  "AI_PROVIDER_NOT_CONFIGURED",
  "MATERIAL_PROVIDER_NOT_CONFIGURED",
];

describe("new-project refusal messages", () => {
  // The failure this exists to stop: a refusal the API added, reaching the
  // creator as "the request could not be completed, retry" -- for a
  // condition no amount of retrying fixes. It has happened three times.
  it("names every refusal instead of falling through to the generic one", () => {
    for (const code of JOB_CREATE_REFUSALS)
      expect(
        reasonKeyFor(new Error(code)),
        `${code} has no reason key`,
      ).not.toBe("requestFailed");
  });

  it("has a message in both locales for every reason it can return", () => {
    for (const locale of ["ko-KR", "en-US"]) {
      const reason = messages(locale);
      for (const key of Object.values(JOB_CREATE_REASONS))
        expect(
          reason[key],
          `${locale} is missing ProjectsNew.reason.${key}`,
        ).toBeTypeOf("string");
      expect(reason.requestFailed).toBeTypeOf("string");
    }
  });

  it("still falls back for a code nobody anticipated", () => {
    expect(reasonKeyFor(new Error("SOMETHING_NEW"))).toBe("requestFailed");
    expect(reasonKeyFor(null)).toBe("networkInterrupted");
  });
});
