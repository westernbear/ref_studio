import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { updateAiProviderSettings } from "./ai-provider-settings.js";
import { openApiDatabase } from "./durable-state.js";
import {
  enrichEvidenceTranslations,
  translateEvidenceText,
  type GenerateTranslation,
} from "./translate-evidence.js";

const AI_SECRET_KEY = "test-secret-key-material";

describe("translateEvidenceText", () => {
  let directory: string;
  let db: ReturnType<typeof openApiDatabase>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "rvs-translate-evidence-"));
    db = openApiDatabase(join(directory, "app.sqlite"));
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("returns null without attempting an AI call when no provider is configured", async () => {
    let called = false;
    const generate: GenerateTranslation = async () => {
      called = true;
      return { object: { translatedText: "unused", confidence: 1 } };
    };
    const result = await translateEvidenceText({
      text: "안녕하세요",
      sourceLocale: "ko-KR",
      targetLocale: "en-US",
      db,
      aiSecretKey: AI_SECRET_KEY,
      generate,
    });
    expect(result).toBeNull();
    expect(called).toBe(false);
  });

  it("returns the translated field when the AI call succeeds", async () => {
    updateAiProviderSettings(
      db,
      { providerKind: "openai", model: "gpt-4o", apiKey: "sk-test", enabled: true },
      "admin",
      1_000,
      AI_SECRET_KEY,
    );
    const generate: GenerateTranslation = async () => ({
      object: { translatedText: "Hello", confidence: 0.95 },
    });
    const result = await translateEvidenceText({
      text: "안녕하세요",
      sourceLocale: "ko-KR",
      targetLocale: "en-US",
      db,
      aiSecretKey: AI_SECRET_KEY,
      generate,
    });
    expect(result).toMatchObject({
      translatedText: "Hello",
      translationProvider: "openai",
      translationConfidence: 0.95,
    });
    expect(result?.translationSourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns null when the AI call throws", async () => {
    updateAiProviderSettings(
      db,
      { providerKind: "openai", model: "gpt-4o", apiKey: "sk-test", enabled: true },
      "admin",
      1_000,
      AI_SECRET_KEY,
    );
    const generate: GenerateTranslation = async () => {
      throw new Error("provider unreachable");
    };
    const result = await translateEvidenceText({
      text: "안녕하세요",
      sourceLocale: "ko-KR",
      targetLocale: "en-US",
      db,
      aiSecretKey: AI_SECRET_KEY,
      generate,
    });
    expect(result).toBeNull();
  });
});

describe("enrichEvidenceTranslations", () => {
  let directory: string;
  let db: ReturnType<typeof openApiDatabase>;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "rvs-enrich-evidence-"));
    db = openApiDatabase(join(directory, "app.sqlite"));
    updateAiProviderSettings(
      db,
      { providerKind: "openai", model: "gpt-4o", apiKey: "sk-test", enabled: true },
      "admin",
      1_000,
      AI_SECRET_KEY,
    );
  });

  afterEach(() => {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it("attaches a translation to each text-word/subtitle owner and leaves others untouched", async () => {
    const evidence: Record<string, unknown> = {
      sceneInput: {
        owners: [
          { ownerId: "global-residual", kind: "global-residual" },
          {
            ownerId: "text-00",
            kind: "text-word",
            content: "안녕하세요",
            sourceLocale: "ko-KR",
          },
          {
            ownerId: "text-01",
            kind: "subtitle",
            content: "hello",
            sourceLocale: "en-US",
          },
        ],
      },
    };
    const generate: GenerateTranslation = async ({ prompt }) => ({
      object: {
        translatedText: prompt.includes("안녕하세요") ? "Hello" : "안녕",
        confidence: 0.9,
      },
    });

    await enrichEvidenceTranslations(evidence, db, AI_SECRET_KEY, generate);

    const owners = (evidence["sceneInput"] as { owners: Record<string, unknown>[] })
      .owners;
    expect(owners[0]?.["translatedText"]).toBeUndefined();
    expect(owners[1]?.["translatedText"]).toBe("Hello");
    expect(owners[1]?.["translationProvider"]).toBe("openai");
    expect(owners[2]?.["translatedText"]).toBe("안녕");
  });

  it("does nothing when sceneInput/owners is missing", async () => {
    const evidence: Record<string, unknown> = {};
    await expect(
      enrichEvidenceTranslations(evidence, db, AI_SECRET_KEY),
    ).resolves.toBeUndefined();
  });
});
