import { fixtureSpec } from "@rvs/contracts";
import { describe, expect, it } from "vitest";
import {
  applyNativeInteraction,
  createNativeInteractionModel,
  parseNativeInteractionEvent,
} from "../../worker/src/scene-interactions.ts";
import { resolveSceneInteraction } from "../src/app/[locale]/scene-review/SceneCanvas.tsx";

describe("creator and package interaction parity", () => {
  it.each([
    ["pointer", { kind: "pointer", target: { beatIndex: 0, elementIndex: 0 } }],
    ["focus", { kind: "focus", target: { beatIndex: 0, elementIndex: 0 } }],
  ])("selects the same deterministic target for %s input", (_name, event) => {
    expect(resolveSceneInteraction(event)).toEqual({
      kind: "select",
      target: event.target,
    });
  });

  it("uses identical keyboard movement units in the creator and package", () => {
    const creator = resolveSceneInteraction({
      kind: "keyboard",
      target: { beatIndex: 0, elementIndex: 0 },
      key: "ArrowRight",
      shiftKey: true,
    });
    const model = createNativeInteractionModel(fixtureSpec);
    const event = parseNativeInteractionEvent({
      kind: "keyboard",
      target: "headline",
      key: "ArrowRight",
      shiftKey: true,
    });
    const packaged = applyNativeInteraction(model, model.initialState, event);

    expect(creator).toMatchObject({ kind: "move", x: 10, y: 0 });
    expect(packaged.offsets.headline).toEqual({ x: 10, y: 0 });
  });

  it.each([
    {
      kind: "keyboard",
      target: { beatIndex: 0, elementIndex: 0 },
      key: "Delete",
      shiftKey: false,
    },
    { kind: "wheel", target: { beatIndex: 0, elementIndex: 0 } },
    {
      kind: "pointer",
      target: { beatIndex: 0, elementIndex: 0 },
      source: "alert(1)",
    },
    { kind: "focus", target: { beatIndex: -1, elementIndex: 0 } },
  ])("leaves state unchanged for unsupported or injected input %#", (event) => {
    expect(resolveSceneInteraction(event)).toBeNull();
  });
});
