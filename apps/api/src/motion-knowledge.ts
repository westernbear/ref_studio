import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { z } from "zod";

export const MOTION_LOOKUP_TOOL_SCHEMA = {
  name: "motion.lookup",
  input: {
    type: "object",
    properties: { query: { type: "string", minLength: 1 } },
    required: ["query"],
    additionalProperties: false,
  },
} as const;

export const MOTION_LOOKUP_TOOL_SCHEMA_DIGEST = createHash("sha256")
  .update(JSON.stringify(MOTION_LOOKUP_TOOL_SCHEMA))
  .digest("hex");

export const MOTION_INTERNAL_FEATURES = [
  "motion_lookup",
  "context_inspect",
  "scene_apply_operations",
  "scene_verify",
] as const;

export const ProviderToolCanaryV1Schema = z
  .object({
    tenantId: z.string().min(1),
    providerKind: z.string().min(1),
    model: z.string().min(1),
    toolName: z.literal("motion.lookup"),
    status: z.enum(["PASS", "FAIL"]),
    checkedAt: z.iso.datetime(),
    toolSchemaDigest: z.string().regex(/^[a-f0-9]{64}$/),
    failureReason: z.string().max(500).nullable().default(null),
  })
  .strict();

export type ProviderToolCanaryV1 = z.infer<typeof ProviderToolCanaryV1Schema>;
export type MotionCanaryIdentity = Pick<
  ProviderToolCanaryV1,
  "tenantId" | "providerKind" | "model"
>;

const JsonText = z.string().transform((value, context): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    context.addIssue({ code: "custom", message: "invalid stored JSON" });
    return z.NEVER;
  }
});

export const MotionKnowledgeCardSchema = z
  .object({
    id: z.string().min(1),
    domain: z.string().min(1),
    title_en: z.string().min(1),
    title_ko: z.string().min(1),
    definition_en: z.string().min(1),
    definition_ko: z.string().min(1),
    distinctions_json: JsonText.pipe(z.array(z.string().min(1)).min(1)),
    parameters_json: JsonText.pipe(
      z
        .array(
          z
            .object({
              name: z.string().min(1),
              unit: z.string().min(1),
              range: z.tuple([z.number(), z.number()]),
            })
            .strict(),
        )
        .min(1),
    ),
    capabilities_json: JsonText.pipe(z.array(z.string().min(1)).min(1)),
    operation_refs_json: JsonText.pipe(z.array(z.string().min(1)).min(1)),
    verifier_refs_json: JsonText.pipe(z.array(z.string().min(1)).min(1)),
    sources_json: JsonText.pipe(z.array(z.url()).min(1)),
  })
  .strict()
  .transform((row) => ({
    id: row.id,
    domain: row.domain,
    title: { en: row.title_en, ko: row.title_ko },
    definition: { en: row.definition_en, ko: row.definition_ko },
    distinctions: row.distinctions_json,
    parameters: row.parameters_json,
    capabilities: row.capabilities_json,
    operationRefs: row.operation_refs_json,
    verifierRefs: row.verifier_refs_json,
    sources: row.sources_json,
  }));

export type MotionKnowledgeCard = z.infer<typeof MotionKnowledgeCardSchema>;

const normalizeQuery = (query: string): string =>
  query.normalize("NFKC").trim().toLocaleLowerCase();

const parseRows = (rows: readonly unknown[]): readonly MotionKnowledgeCard[] =>
  rows.map((row) => MotionKnowledgeCardSchema.parse(row));

const lookupExactMotionKnowledge = (
  db: Database.Database,
  normalized: string,
): readonly MotionKnowledgeCard[] =>
  parseRows(
    db
      .prepare(
        `SELECT card.*
           FROM motion_aliases AS alias
           JOIN motion_cards AS card ON card.id = alias.card_id
          WHERE alias.alias = ? COLLATE NOCASE
          LIMIT 3`,
      )
      .all(normalized),
  );

export function lookupMotionKnowledge(
  db: Database.Database,
  query: string,
): readonly MotionKnowledgeCard[] {
  const normalized = normalizeQuery(query);
  if (normalized.length === 0) return [];

  const exact = lookupExactMotionKnowledge(db, normalized);
  if (exact.length > 0) return exact;

  const tokens = normalized.match(/[\p{L}\p{N}%]+/gu) ?? [];
  if (tokens.length === 0) return [];
  const match = tokens.map((token) => `"${token}"`).join(" AND ");
  return parseRows(
    db
      .prepare(
        `SELECT card.*
           FROM motion_cards_fts AS search
           JOIN motion_cards AS card ON card.id = search.card_id
          WHERE motion_cards_fts MATCH ?
          ORDER BY bm25(motion_cards_fts)
          LIMIT 3`,
      )
      .all(match),
  );
}

export function lookupMotionKnowledgeForBrief(
  db: Database.Database,
  brief: string,
): readonly MotionKnowledgeCard[] {
  const normalized = normalizeQuery(brief);
  if (normalized.length === 0) return [];

  const tokens =
    normalized.match(/[\p{L}\p{N}]+(?:[%.-][\p{L}\p{N}]+)*/gu) ?? [];
  const matches = new Map<string, MotionKnowledgeCard>();
  const add = (cards: readonly MotionKnowledgeCard[]): boolean => {
    for (const card of cards) {
      matches.set(card.id, card);
      if (matches.size === 3) return true;
    }
    return false;
  };
  for (let width = Math.min(tokens.length, 4); width > 0; width -= 1) {
    for (let start = 0; start + width <= tokens.length; start += 1) {
      if (
        add(
          lookupExactMotionKnowledge(
            db,
            tokens.slice(start, start + width).join(" "),
          ),
        )
      )
        return [...matches.values()];
    }
  }
  if (add(lookupMotionKnowledge(db, brief))) return [...matches.values()];
  for (let width = Math.min(tokens.length, 4); width > 2; width -= 1) {
    for (let start = 0; start + width <= tokens.length; start += 1) {
      if (
        add(
          lookupMotionKnowledge(
            db,
            tokens.slice(start, start + width).join(" "),
          ),
        )
      )
        return [...matches.values()];
    }
  }
  return [...matches.values()];
}

// Compatibility wrapper: retains canonical exact-alias, then FTS5 brief lookup.
export function hostMotionLookup(
  db: Database.Database,
  text: string,
): readonly MotionKnowledgeCard[] {
  return lookupMotionKnowledgeForBrief(db, text);
}

export function modelMotionTools(
  canary: ProviderToolCanaryV1 | null,
  expected: MotionCanaryIdentity,
  now: number,
  ttlMs: number,
): readonly "motion.lookup"[] {
  if (
    canary?.status !== "PASS" ||
    canary.tenantId !== expected.tenantId ||
    canary.providerKind !== expected.providerKind ||
    canary.model !== expected.model ||
    canary.toolSchemaDigest !== MOTION_LOOKUP_TOOL_SCHEMA_DIGEST ||
    ttlMs <= 0 ||
    now >= Date.parse(canary.checkedAt) + ttlMs
  )
    return [];
  return ["motion.lookup"];
}
