import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateAiProviderSettings } from "./ai-provider-settings.js";
import { openApiDatabase } from "./durable-state.js";
import { runSafetyCheck, type GenerateSafetyVerdict } from "./safety-check.js";

const AI_SECRET_KEY = "test-secret-key-material";

describe("runSafetyCheck", () => {
  let directory: string;
  let db: ReturnType<typeof openApiDatabase>;
  let imagePath: string;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "rvs-safety-check-"));
    db = openApiDatabase(join(directory, "app.sqlite"));
    imagePath = join(directory, "frame.png");
    writeFileSync(imagePath, Uint8Array.from([137, 80, 78, 71]));
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("returns safe:false without attempting an AI call when no provider is configured", async () => {
    let called = false;
    const generate: GenerateSafetyVerdict = async () => {
      called = true;
      return { object: { safe: true, reason: "unused" } };
    };
    const verdict = await runSafetyCheck({
      imagePath,
      db,
      aiSecretKey: AI_SECRET_KEY,
      generate,
    });
    expect(verdict).toEqual({
      safe: false,
      reason: "AI_PROVIDER_NOT_CONFIGURED",
    });
    expect(called).toBe(false);
  });

  it("returns the AI verdict when it says safe:true", async () => {
    updateAiProviderSettings(
      db,
      { providerKind: "openai", model: "gpt-4o", apiKey: "sk-test", enabled: true },
      "admin",
      1_000,
      AI_SECRET_KEY,
    );
    const generate: GenerateSafetyVerdict = async () => ({
      object: { safe: true, reason: "no unsafe content detected" },
    });
    const verdict = await runSafetyCheck({
      imagePath,
      db,
      aiSecretKey: AI_SECRET_KEY,
      generate,
    });
    expect(verdict).toEqual({
      safe: true,
      reason: "no unsafe content detected",
    });
  });

  it("returns the AI verdict when it says safe:false", async () => {
    updateAiProviderSettings(
      db,
      { providerKind: "openai", model: "gpt-4o", apiKey: "sk-test", enabled: true },
      "admin",
      1_000,
      AI_SECRET_KEY,
    );
    const generate: GenerateSafetyVerdict = async () => ({
      object: { safe: false, reason: "explicit content detected" },
    });
    const verdict = await runSafetyCheck({
      imagePath,
      db,
      aiSecretKey: AI_SECRET_KEY,
      generate,
    });
    expect(verdict).toEqual({
      safe: false,
      reason: "explicit content detected",
    });
  });

  it("returns safe:false when the AI call throws", async () => {
    updateAiProviderSettings(
      db,
      { providerKind: "openai", model: "gpt-4o", apiKey: "sk-test", enabled: true },
      "admin",
      1_000,
      AI_SECRET_KEY,
    );
    const generate: GenerateSafetyVerdict = async () => {
      throw new Error("provider unreachable");
    };
    const verdict = await runSafetyCheck({
      imagePath,
      db,
      aiSecretKey: AI_SECRET_KEY,
      generate,
    });
    expect(verdict).toEqual({ safe: false, reason: "SAFETY_CHECK_FAILED" });
  });
});
