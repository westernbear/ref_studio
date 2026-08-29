import { z } from "zod";
import { listCodexModels, parseCodexAuth } from "./codex-oauth.js";
import type { CodexAuth, CodexFetch } from "./codex-oauth.js";

// Asks a provider which models it actually has, so the console can offer a
// list instead of a text box.
//
// A typed model name is a trap with no feedback: putting an image model in
// the AI provider's field produced "models/gpt-image-2 is not found for API
// version v1beta, or is not supported for generateContent" -- eleven
// minutes into a job, in a server log, with nothing on screen. The name is
// the one field where the provider knows the right answers and the operator
// is guessing.
//
// Three shapes cover every provider wired here. Free-text entry stays: a
// model released this morning is not in any list yet, and a provider whose
// listing endpoint is down should not stop someone configuring it.

export class ProviderModelsError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = "ProviderModelsError";
    this.code = code;
  }
}

// The one network seam, injectable so a test never reaches a vendor.
export type ModelsFetch = (
  url: string,
  headers: Readonly<Record<string, string>>,
) => Promise<Readonly<{ status: number; text: () => Promise<string> }>>;

const defaultModelsFetch: ModelsFetch = async (url, headers) => {
  const response = await fetch(url, { headers });
  return { status: response.status, text: () => response.text() };
};

// OpenAI and everything that copies its API: GET {base}/models -> data[].id
const OpenAiListing = z.object({
  data: z.array(z.looseObject({ id: z.string().min(1) })),
});
// Anthropic: the same envelope, a different auth header.
const AnthropicListing = OpenAiListing;
// Google: GET {base}/models?key= -> models[].name, prefixed "models/", and
// with a per-model list of what it can actually be asked to do. Filtering
// on that list is the point of this whole file: an image model is in the
// response, and choosing it is exactly the mistake being prevented.
const GoogleListing = z.object({
  models: z.array(
    z.looseObject({
      name: z.string().min(1),
      supportedGenerationMethods: z.array(z.string()).optional(),
    }),
  ),
});

const OPENAI_COMPATIBLE_BASE: Readonly<Record<string, string>> = {
  openai: "https://api.openai.com/v1",
  xai: "https://api.x.ai/v1",
  groq: "https://api.groq.com/openai/v1",
  mistral: "https://api.mistral.ai/v1",
  deepseek: "https://api.deepseek.com",
  cerebras: "https://api.cerebras.ai/v1",
  perplexity: "https://api.perplexity.ai",
  fireworks: "https://api.fireworks.ai/inference/v1",
  togetherai: "https://api.together.xyz/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
  moonshotai: "https://api.moonshot.ai/v1",
};

// What the model is being chosen for. Both settings pages ask the same
// provider the same question and get one undifferentiated list back: an
// image model in the scene-authoring field is what produced "not supported
// for generateContent" eleven minutes into a job, and a text model in the
// image-generator field is the same mistake facing the other way.
export type ModelCapability = "text" | "image";

export type ProviderModelsRequest = Readonly<{
  providerKind: string;
  apiKey: string;
  baseUrl: string | null;
  capability: ModelCapability;
  fetch?: ModelsFetch;
  // codex-oauth only: its registry is a different endpoint with a different
  // auth story, so it gets its own seam rather than being bent through
  // ModelsFetch.
  codexFetch?: CodexFetch;
  persistCodexAuth?: (auth: CodexAuth) => void;
}>;

// OpenAI's /v1/models says nothing about what a model can do, so an image
// field would otherwise offer every text model it has. Matching on the id
// is a heuristic and openly one; it is the difference between a usable
// picker and a hundred wrong answers, and free text covers what it misses.
const IMAGE_MODEL_ID = /^(gpt-image|dall-e|imagen)/u;

const parse = <T>(schema: z.ZodType<T>, body: string): T => {
  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new ProviderModelsError("PROVIDER_MODELS_UNREADABLE");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new ProviderModelsError("PROVIDER_MODELS_UNREADABLE");
  return parsed.data;
};

// Sorted, so the list does not reshuffle between two loads of the same
// page for no reason the operator can see.
const sorted = (ids: readonly string[]): readonly string[] =>
  [...new Set(ids)].sort((left, right) => left.localeCompare(right));

// Fails the way every other provider here fails -- an error the route turns
// into an empty list, a reason on screen and a free-text field. Substituting
// a list of plausible names instead would be worse than no list: they are
// names this account may not have, and the operator would only find that out
// when a job died on one.
// Both capabilities get the same list, which is not the mistake it looks
// like: on this path the picture comes from the image_generation tool
// running on an ordinary Codex model, and asking for an image model is
// refused. So the image field names the same kind of model the chat field
// does, and the registry is the only thing that knows which ones exist --
// one account answers gpt-5.4 and gpt-5.3-codex-spark where a static guess
// here said gpt-5.1-codex, and every name in that guess would have failed
// at job time.
const listCodex = async (
  request: ProviderModelsRequest,
): Promise<readonly string[]> => {
  let auth: CodexAuth;
  try {
    auth = parseCodexAuth(request.apiKey);
  } catch {
    throw new ProviderModelsError("PROVIDER_MODELS_UNREADABLE");
  }
  const listed = await listCodexModels({
    auth,
    ...(request.codexFetch ? { request: request.codexFetch } : {}),
  });
  // A refresh here rotates the stored refresh token, so dropping it would
  // leave the console's copy stale and the credential dead on the next job.
  // The caller that owns the row writes it back.
  if (listed.refreshedAuth) request.persistCodexAuth?.(listed.refreshedAuth);
  // The registry has never answered with one, but an image model reaching
  // either picker is the exact failure this module was written to stop --
  // see the header, and note that this backend refuses image models. One
  // predicate is cheaper than finding out again.
  return sorted(listed.models.filter((id) => !IMAGE_MODEL_ID.test(id)));
};

export async function listProviderModels(
  request: ProviderModelsRequest,
): Promise<readonly string[]> {
  const call = request.fetch ?? defaultModelsFetch;
  const read = async (url: string, headers: Record<string, string>) => {
    const response = await call(url, headers);
    if (response.status !== 200)
      throw new ProviderModelsError(
        `PROVIDER_MODELS_REQUEST_FAILED_${response.status}`,
      );
    return response.text();
  };

  if (request.providerKind === "codex-oauth") return listCodex(request);

  if (request.providerKind === "google") {
    const base =
      request.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    const body = await read(
      `${base.replace(/\/+$/u, "")}/models?key=${encodeURIComponent(request.apiKey)}&pageSize=200`,
      {},
    );
    return sorted(
      parse(GoogleListing, body)
        .models.filter(
          (model) =>
            request.capability !== "text" ||
            // Absent means the provider did not say; kept rather than
            // dropped, because hiding a usable model is the worse error.
            model.supportedGenerationMethods === undefined ||
            model.supportedGenerationMethods.includes("generateContent"),
        )
        .map((model) => model.name.replace(/^models\//u, "")),
    );
  }

  if (request.providerKind === "anthropic") {
    const base = request.baseUrl ?? "https://api.anthropic.com/v1";
    const body = await read(`${base.replace(/\/+$/u, "")}/models?limit=1000`, {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
    });
    return sorted(parse(AnthropicListing, body).data.map((model) => model.id));
  }

  const base =
    request.baseUrl ?? OPENAI_COMPATIBLE_BASE[request.providerKind] ?? null;
  // A provider with no known listing endpoint is not an error: the console
  // falls back to typing a name, which is what it did for all of them
  // before. Saying so by name beats a misleading empty list.
  if (!base) throw new ProviderModelsError("PROVIDER_MODELS_UNSUPPORTED");
  const body = await read(`${base.replace(/\/+$/u, "")}/models`, {
    authorization: `Bearer ${request.apiKey}`,
  });
  const ids = parse(OpenAiListing, body).data.map((model) => model.id);
  return sorted(
    request.capability === "image"
      ? ids.filter((id) => IMAGE_MODEL_ID.test(id))
      : ids,
  );
}
