import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCompilerJob,
  uploadJobAttachment,
} from "../src/lib/upload-client.ts";

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
        createCompilerJob(
          media,
          { startFrame: 0 },
          new AbortController().signal,
        ),
      ).rejects.toThrow("NETWORK_INTERRUPTED");
    },
  );

  it("sends a prompt instead of a startFrame when creating from creative intent", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        capturedBody = JSON.parse(init.body);
        return Response.json({ id: "job_1" }, { status: 201 });
      }),
    );
    const jobId = await createCompilerJob(
      media,
      { prompt: "make it dramatic" },
      new AbortController().signal,
    );
    expect(jobId).toBe("job_1");
    expect(capturedBody).toMatchObject({ prompt: "make it dramatic" });
    expect(capturedBody).not.toHaveProperty("startFrame");
  });
});

describe("job attachment upload", () => {
  it("sends the file with an encoded filename header", async () => {
    let capturedInit = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        capturedInit = init;
        return new Response(null, { status: 201 });
      }),
    );
    const file = new File(["hello"], "무드보드.png", { type: "image/png" });
    await uploadJobAttachment("job_1", file, new AbortController().signal);
    expect(capturedInit.headers["x-filename"]).toBe(
      encodeURIComponent("무드보드.png"),
    );
    expect(capturedInit.headers["content-type"]).toBe("image/png");
  });

  it("throws NETWORK_INTERRUPTED when the upload fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 500 })),
    );
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    await expect(
      uploadJobAttachment("job_1", file, new AbortController().signal),
    ).rejects.toThrow("NETWORK_INTERRUPTED");
  });
});
