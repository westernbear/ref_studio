import { openApiDatabase } from "../dist/apps/api/src/durable-state.js";
import { MOTION_LOOKUP_CORPUS } from "../dist/apps/api/src/motion-knowledge.corpus.fixture.js";
import { lookupMotionKnowledge } from "../dist/apps/api/src/motion-knowledge.js";

const db = openApiDatabase(":memory:");
const totals = { en: 0, ko: 0, mixed: 0 };
const hits = { en: 0, ko: 0, mixed: 0 };
const domains = {};
let recallAt1 = 0;
let recallAt3 = 0;
let supported = 0;
let unsupportedAccepted = 0;

for (const [domain, queries, unsupported] of MOTION_LOOKUP_CORPUS) {
  let domainHits = 0;
  for (const [index, query] of queries.entries()) {
    const language = index < 4 ? (index % 2 === 0 ? "en" : "ko") : "mixed";
    const results = lookupMotionKnowledge(db, query);
    supported += 1;
    totals[language] += 1;
    if (results[0]?.domain === domain) {
      recallAt1 += 1;
      domainHits += 1;
      hits[language] += 1;
    }
    if (results.some((result) => result.domain === domain)) recallAt3 += 1;
  }
  domains[domain] = domainHits / queries.length;
  if (lookupMotionKnowledge(db, unsupported).length > 0)
    unsupportedAccepted += 1;
}

db.close();
const metrics = {
  supported,
  recallAt1: recallAt1 / supported,
  recallAt3: recallAt3 / supported,
  languages: Object.fromEntries(
    Object.keys(totals).map((language) => [
      language,
      hits[language] / totals[language],
    ]),
  ),
  domains,
  unsupportedAccepted,
};
console.log(JSON.stringify(metrics));
if (
  metrics.supported !== 120 ||
  metrics.recallAt1 !== 1 ||
  metrics.recallAt3 < 0.95 ||
  Object.values(metrics.languages).some((recall) => recall < 0.9) ||
  Object.values(metrics.domains).some((recall) => recall < 0.9) ||
  metrics.unsupportedAccepted !== 0
) {
  process.exitCode = 1;
}
