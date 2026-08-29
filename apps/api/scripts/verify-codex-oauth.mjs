// Finds out whether the codex-oauth image path actually works, against the
// real endpoint, before a job does.
//
// The request shape in src/codex-oauth.ts follows the published behaviour
// of the Codex client and of the Responses API's image_generation tool, but
// it is not a documented, supported API surface and nothing in this
// repository can exercise it in CI. This script is the answer to "is it
// real?": it reads a credential, asks for one small transparent image, and
// says exactly which step failed if one did.
//
//   node scripts/verify-codex-oauth.mjs                 # ~/.codex/auth.json
//   node scripts/verify-codex-oauth.mjs path/to/auth.json
//   node scripts/verify-codex-oauth.mjs --chat           # the chat path
//   node scripts/verify-codex-oauth.mjs --chat --model=gpt-5.1
//   node scripts/verify-codex-oauth.mjs --models          # the registry
//
// --chat asks the same credential for one structured object instead of one
// image, which is what every AI call in this repo does. It is the only way
// to find out whether the chat provider's request shape is right, for the
// same reason: nothing in CI can reach the endpoint.
//
// It never writes anything back. A refresh that happens here is not
// persisted, so run it before pasting the credential into the console, not
// after -- a rotated refresh token would leave the console's copy stale.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const argv = process.argv.slice(2);
const flag = (name) => argv.some((entry) => entry === `--${name}`);
const option = (name, fallback) => {
  const found = argv.find((entry) => entry.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
};
const path =
  argv.find((entry) => !entry.startsWith("--")) ??
  join(homedir(), ".codex", "auth.json");
// No default worth writing down: which models an account can run is what
// the registry answers, and a constant here would be a guess that fails at
// request time. --model= overrides.
const MODEL = option("model", null);

const step = (name, detail) =>
  console.log(JSON.stringify({ step: name, ...detail }));

const main = async () => {
  const { generateCodexImage, listCodexModels, parseCodexAuth } = await import(
    "../dist/apps/api/src/codex-oauth.js"
  );

  let auth;
  try {
    auth = parseCodexAuth(readFileSync(path, "utf8"));
  } catch (error) {
    step("read-credential", {
      ok: false,
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    return;
  }
  step("read-credential", {
    ok: true,
    path,
    authMode: auth.auth_mode ?? null,
    hasAccountId: Boolean(auth.tokens.account_id),
    lastRefresh: auth.last_refresh ?? null,
  });

  if (flag("models")) {
    const { listCodexModels } = await import(
      "../dist/apps/api/src/codex-oauth.js"
    );
    const started = Date.now();
    try {
      const listed = await listCodexModels({ auth });
      step("models", {
        ok: true,
        elapsedMs: Date.now() - started,
        count: listed.models.length,
        models: listed.models,
        refreshed: Boolean(listed.refreshedAuth),
      });
      console.log(
        "codex-oauth model registry works against the live endpoint.",
      );
    } catch (error) {
      step("models", {
        ok: false,
        elapsedMs: Date.now() - started,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
    return;
  }

  // Which models exist is the registry's answer, not this script's.
  // codex-auto-review is Codex's own helper, not something to test with.
  const resolveModel = async () => {
    if (MODEL) return MODEL;
    const { models } = await listCodexModels({ auth });
    const chosen =
      models.find((slug) => !slug.includes("auto-review")) ?? models[0];
    if (!chosen) throw new Error("the registry listed no models");
    return chosen;
  };

  if (flag("chat")) {
    const { createCodexChatModel } = await import(
      "../dist/apps/api/src/codex-chat.js"
    );
    const { generateObject } = await import("ai");
    const { z } = await import("zod");
    const chatStarted = Date.now();
    const model = await resolveModel();
    try {
      const { object } = await generateObject({
        model: createCodexChatModel({ auth, model }),
        schema: z.object({ answer: z.string().min(1) }),
        prompt: "Reply with the single word: pong.",
      });
      step("chat", {
        ok: true,
        model,
        elapsedMs: Date.now() - chatStarted,
        answer: object.answer,
      });
      console.log("codex-oauth chat works against the live endpoint.");
    } catch (error) {
      step("chat", {
        ok: false,
        model,
        elapsedMs: Date.now() - chatStarted,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
    return;
  }

  const started = Date.now();
  const model = await resolveModel();
  let generated;
  try {
    generated = await generateCodexImage({
      auth,
      model,
      prompt:
        "a single flat solid red circle, centred, on a fully transparent background",
      size: "1024x1024",
    });
  } catch (error) {
    step("generate", {
      ok: false,
      model,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    return;
  }

  const bytes = Buffer.from(generated.b64, "base64");
  // The pipeline's own check, imported rather than reimplemented: this
  // backend refuses a transparent-background request and answers RGBA
  // regardless, so an alpha channel proves nothing and only the pixels do.
  const { pngHasAlpha } = await import(
    "../dist/apps/api/src/openai-image-material.js"
  );
  const isPng =
    bytes.length > 25 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const colorType = isPng ? bytes[25] : null;
  const hasAlpha = pngHasAlpha(bytes);
  step("generate", {
    ok: true,
    model,
    elapsedMs: Date.now() - started,
    bytes: bytes.length,
    isPng,
    colorType,
    hasAlpha,
    refreshed: Boolean(generated.refreshedAuth),
  });
  if (!isPng || !hasAlpha) {
    console.log(
      "The endpoint answered, but not with a transparent PNG. The pipeline refuses this as MATERIAL_TRANSPARENCY_UNAVAILABLE.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("codex-oauth image generation works against the live endpoint.");
};

await main();
