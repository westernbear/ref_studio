import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "../..");
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const fixturePath = option("--fixture");
if (fixturePath !== undefined) {
  const fixture = JSON.parse(
    readFileSync(resolve(workspace, fixturePath), "utf8"),
  );
  const lock = JSON.parse(
    readFileSync(
      resolve(workspace, "verification/contract/fixture-manifest.lock.json"),
      "utf8",
    ),
  );
  const ablation = lock.fixtures.find((entry) => entry.id === "ablation");
  const variants = JSON.parse(
    readFileSync(
      resolve(
        workspace,
        "verification/contract/fixtures/ablation/variants/manifest.json",
      ),
      "utf8",
    ),
  );
  const expected = fixture.expectedError;
  if (fixture.fixtureId === "pass-swapped") {
    const locked = lock.fixtures.find(
      (entry) => entry.id === fixture.fixtureId,
    );
    if (
      locked?.truthSha256 === fixture.mutatedTruthSha256 ||
      locked?.rawFrameSha256 === fixture.mutatedRawFrameSha256
    ) {
      throw new Error("NEGATIVE_FIXTURE_MUTATION_NOT_APPLIED");
    }
    throw new Error("WRONG_FRAME_CONTRACT");
  }
  if (
    fixture.fixtureId === "ablation" &&
    fixture.requiredVariant !== undefined &&
    !Object.hasOwn(variants.variants, fixture.requiredVariant)
  ) {
    throw new Error("FIXTURE_VARIANT_MISSING");
  }
  if (
    fixture.fixtureId === "ablation" &&
    fixture.requiredEffectBinding !== fixture.observedEffectBinding &&
    ablation?.variants?.removeBloom
  ) {
    throw new Error("UNBOUND_EFFECT");
  }
  const defocus = ablation?.variants?.removeDefocus;
  if (
    fixture.fixtureId === "ablation" &&
    fixture.profile?.claimedSigma !== fixture.profile?.observedSigma &&
    defocus?.variantRawFrameSha256 === fixture.profile?.observedRawFrameSha256
  ) {
    throw new Error("DEFOCUS_PROFILE_MISMATCH");
  }
  throw new Error(`NEGATIVE_FIXTURE_NOT_REJECTED expected=${expected}`);
}

const lock =
  option("--lock") ?? "verification/contract/fixture-manifest.lock.json";
const contract =
  ".omo/drafts/reference-video-studio-saas-fixture-contract-v2.json";
execFileSync(
  process.execPath,
  [
    resolve(workspace, "scripts/fixtures/lock.mjs"),
    "--contract",
    contract,
    "--lock",
    lock,
    "--no-write-lock",
  ],
  {
    cwd: workspace,
    stdio: "inherit",
  },
);
