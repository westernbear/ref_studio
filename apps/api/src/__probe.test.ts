import { it } from "vitest";
import { generateObject, tool } from "ai";
import { z } from "zod";
import { SceneSpecV1Schema } from "../../../packages/contracts/src/scene-spec.js";
import { createCodexChatModel } from "./codex-chat.js";
import { parseCodexAuth, type CodexFetch } from "./codex-oauth.js";

const auth = parseCodexAuth(
  JSON.stringify({
    auth_mode: "chatgpt",
    tokens: {
      id_token: "id",
      access_token: "a",
      refresh_token: "r",
      account_id: "acct",
    },
  }),
);

it("captures the outgoing body", async () => {
  let sent = "";
  const request: CodexFetch = async (_url, init) => {
    sent = init.body ?? "";
    return { status: 500, contentType: "application/json", text: async () => "stop" };
  };
  const model = createCodexChatModel({ auth, model: "gpt-5.1-codex", request });
  await generateObject({
    model,
    schema: SceneSpecV1Schema,
    system: "s",
    prompt: "p",
    tools: {
      motion_lookup: tool({
        description: "Look up canonical motion knowledge.",
        inputSchema: z.object({ query: z.string().min(1) }).strict(),
        execute: async () => ({}),
      }),
    },
  } as never).catch(() => undefined);
  const body = JSON.parse(sent) as Record<string, unknown>;
  console.log("TOP KEYS:", Object.keys(body));
  console.log("TEXT:", JSON.stringify(body.text).slice(0, 300));
  console.log("RESPONSE_FORMAT:", JSON.stringify(body.response_format).slice(0, 300));
});
