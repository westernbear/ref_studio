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
const CHAT_MODEL = option("model", "gpt-5.1-codex");

const step = (name, detail) =>
  console.log(JSON.stringify({ step: name, ...detail }));

const main = async () => {
  const { generateCodexImage, parseCodexAuth, CODEX_IMAGE_MODEL } =
    await import("../dist/apps/api/src/codex-oauth.js");

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

  if (flag("chat")) {
    const { createCodexChatModel } = await import(
      "../dist/apps/api/src/codex-chat.js"
    );
    const { generateObject } = await import("ai");
    const { z } = await import("zod");
    const chatStarted = Date.now();
    try {
      const { object } = await generateObject({
        model: createCodexChatModel({ auth, model: CHAT_MODEL }),
        schema: z.object({ answer: z.string().min(1) }),
        prompt: "Reply with the single word: pong.",
      });
      step("chat", {
        ok: true,
        model: CHAT_MODEL,
        elapsedMs: Date.now() - chatStarted,
        answer: object.answer,
      });
      console.log("codex-oauth chat works against the live endpoint.");
    } catch (error) {
      step("chat", {
        ok: false,
        model: CHAT_MODEL,
        elapsedMs: Date.now() - chatStarted,
        error: error instanceof Error ? error.message : String(error),
      });
      process.exitCode = 1;
    }
    return;
  }

  const started = Date.now();
  let generated;
  try {
    generated = await generateCodexImage({
      auth,
      prompt:
        "a single flat solid red circle, centred, on a fully transparent background",
      size: "1024x1024",
    });
  } catch (error) {
    step("generate", {
      ok: false,
      model: CODEX_IMAGE_MODEL,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    });
    process.exitCode = 1;
    return;
  }

  const bytes = Buffer.from(generated.b64, "base64");
  // The same check the pipeline applies: an opaque PNG is as useless as no
  // PNG, because the renderer composites this over a scene.
  const isPng =
    bytes.length > 25 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const colorType = isPng ? bytes[25] : null;
  const hasAlpha = colorType === 4 || colorType === 6;
  step("generate", {
    ok: true,
    model: CODEX_IMAGE_MODEL,
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
