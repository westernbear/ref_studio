import { afterEach, describe, expect, it, vi } from "vitest";
import { createCompilerJob } from "../src/lib/upload-client.ts";

const media = {
  uploadId: "upload_123",
  fps: 30,
  frameCount: 120,
  durationSeconds: 4,
};

afterEach(() => vi.unstubAllGlobals());

describe("compiler job creation", () => {
  it.each([{}, { id: "" }, { id: " " }, { id: 123 }])(
    "rejects a successful response without a non-empty string id",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          Response.json(body, {
            status: 201,
          }),
        ),
      );

      await expect(
        createCompilerJob(media, 0, new AbortController().signal),
      ).rejects.toThrow("NETWORK_INTERRUPTED");
    },
  );
});
