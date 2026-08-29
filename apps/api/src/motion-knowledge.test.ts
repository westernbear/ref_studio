import { describe, expect, it } from "vitest";
import { openApiDatabase } from "./durable-state.js";
import {
  lookupMotionKnowledge,
  modelMotionTools,
  MotionKnowledgeCardSchema,
  ProviderToolCanaryV1Schema,
} from "./motion-knowledge.js";

import { MOTION_LOOKUP_CORPUS } from "./motion-knowledge.corpus.fixture.js";

describe("motion knowledge migration", () => {
  it("Given a migrated database, when motion domains are counted, then all 15 domains exist", () => {
    // Given
    const db = openApiDatabase(":memory:");

    // When
    const count = db
      .prepare("SELECT count(DISTINCT domain) FROM motion_cards")
      .pluck()
      .get();

    // Then
    expect(count).toBe(15);
    db.close();
  });
});

describe("motion.lookup", () => {
  it("Given the bilingual corpus, when each query is looked up, then metrics meet the fixed thresholds", () => {
    // Given
    const db = openApiDatabase(":memory:");
    let supported = 0;
    let recallAt1 = 0;
    let recallAt3 = 0;
    let unsupportedAccepted = 0;
    const languageHits = { en: 0, ko: 0, mixed: 0 };
    const languageTotals = { en: 0, ko: 0, mixed: 0 };

    // When
    for (const [domain, queries, unsupported] of MOTION_LOOKUP_CORPUS) {
      let domainHits = 0;
      for (const [index, query] of queries.entries()) {
        const results = lookupMotionKnowledge(db, query);
        const language = index < 4 ? (index % 2 === 0 ? "en" : "ko") : "mixed";
        supported += 1;
        languageTotals[language] += 1;
        if (results[0]?.domain === domain) {
          recallAt1 += 1;
          domainHits += 1;
          languageHits[language] += 1;
        }
        if (results.some((result) => result.domain === domain)) recallAt3 += 1;
      }
      expect(domainHits / queries.length).toBeGreaterThanOrEqual(0.9);
      if (lookupMotionKnowledge(db, unsupported).length > 0)
        unsupportedAccepted += 1;
    }

    // Then
    expect(MOTION_LOOKUP_CORPUS.length * 8).toBe(120);
    expect(recallAt1 / supported).toBe(1);
    expect(recallAt3 / supported).toBeGreaterThanOrEqual(0.95);
    expect(languageHits.en / languageTotals.en).toBeGreaterThanOrEqual(0.9);
    expect(languageHits.ko / languageTotals.ko).toBeGreaterThanOrEqual(0.9);
    expect(languageHits.mixed / languageTotals.mixed).toBeGreaterThanOrEqual(
      0.9,
    );
    expect(unsupportedAccepted).toBe(0);
    db.close();
  });

  it("Given a semantic phrase rather than an alias, when lookup runs, then FTS5 ranks the relevant card", () => {
    // Given
    const db = openApiDatabase(":memory:");

    // When
    const results = lookupMotionKnowledge(
      db,
      "velocity evolves between keyframes",
    );

    // Then
    expect(results[0]?.domain).toBe("timing-easing");
    db.close();
  });

  it("Given stored cards, when their payloads are parsed, then every card has the authoring contract", () => {
    // Given
    const db = openApiDatabase(":memory:");
    const rows = db.prepare("SELECT * FROM motion_cards").all();

    // When
    const cards = rows.map((row) => MotionKnowledgeCardSchema.parse(row));

    // Then
    expect(cards).toHaveLength(15);
    expect(
      cards.every(
        (card) =>
          card.parameters.length > 0 &&
          card.capabilities.length > 0 &&
          card.operationRefs.length > 0 &&
          card.verifierRefs.length > 0 &&
          card.sources.length > 0,
      ),
    ).toBe(true);
    db.close();
  });
});

describe("motion lookup model exposure", () => {
  it("Given no passing provider canary, when model tools are selected, then motion.lookup stays host-only", () => {
    // Given
    const failed = ProviderToolCanaryV1Schema.parse({
      providerKind: "openai",
      model: "gpt-test",
      toolName: "motion.lookup",
      status: "FAIL",
      checkedAt: "2026-08-29T00:00:00Z",
    });

    // When
    const withoutCanary = modelMotionTools(null);
    const afterFailure = modelMotionTools(failed);

    // Then
    expect(withoutCanary).toEqual([]);
    expect(afterFailure).toEqual([]);
  });

  it("Given a passing provider tool canary, when model tools are selected, then only motion.lookup is exposed", () => {
    // Given
    const passed = ProviderToolCanaryV1Schema.parse({
      providerKind: "openai",
      model: "gpt-test",
      toolName: "motion.lookup",
      status: "PASS",
      checkedAt: "2026-08-29T00:00:00Z",
    });

    // When
    const tools = modelMotionTools(passed);

    // Then
    expect(tools).toEqual(["motion.lookup"]);
  });
});
