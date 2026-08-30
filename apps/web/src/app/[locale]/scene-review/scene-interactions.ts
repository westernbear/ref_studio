import { z } from "zod";

const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"] as const;
const target = z.object({
  beatIndex: z.number().int().nonnegative(),
  elementIndex: z.number().int().nonnegative(),
});
const eventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("pointer"), target }).strict(),
  z.object({ kind: z.literal("focus"), target }).strict(),
  z
    .object({
      kind: z.literal("keyboard"),
      target,
      key: z.enum(keys),
      shiftKey: z.boolean(),
    })
    .strict(),
]);

export type SceneInteractionAction =
  | Readonly<{
      kind: "select";
      target: Readonly<{ beatIndex: number; elementIndex: number }>;
    }>
  | Readonly<{
      kind: "move";
      target: Readonly<{ beatIndex: number; elementIndex: number }>;
      x: number;
      y: number;
    }>;

const movement = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
} as const;

export function resolveSceneInteraction(
  value: unknown,
): SceneInteractionAction | null {
  const parsed = eventSchema.safeParse(value);
  if (!parsed.success) return null;
  if (parsed.data.kind !== "keyboard")
    return { kind: "select", target: parsed.data.target };
  const [x, y] = movement[parsed.data.key];
  const multiplier = parsed.data.shiftKey ? 10 : 1;
  return {
    kind: "move",
    target: parsed.data.target,
    x: x * multiplier,
    y: y * multiplier,
  };
}
