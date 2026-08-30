import { describe, expect, test } from "vitest";
import golden from "../../../verification/contract/adobe-mcp-v1.json" with { type: "json" };
import {
  ADOBE_TOOL_NAMES_V1,
  AdobeCapabilitySnapshotV1Schema,
  AdobeCommandEnvelopeV1Schema,
  AdobeCommandResultV1Schema,
} from "./adobe.js";

describe("Adobe MCP v1 boundary", () => {
  test("accepts the 25 typed golden commands and results", () => {
    expect(golden.tools).toHaveLength(25);
    expect(golden.tools.map(({ tool }) => tool)).toEqual(ADOBE_TOOL_NAMES_V1);
    for (const [index, vector] of golden.tools.entries()) {
      const command = {
        ...golden.commandBase,
        commandId: `cmd-golden-${String(index).padStart(2, "0")}`,
        tool: vector.tool,
        args: vector.args,
      };
      expect(AdobeCommandEnvelopeV1Schema.safeParse(command).success).toBe(
        true,
      );
      expect(
        AdobeCommandResultV1Schema.safeParse({
          ...golden.resultBase,
          commandId: command.commandId,
          changedFields: vector.changedFields,
          payload: vector.payload,
        }).success,
      ).toBe(true);
    }
  });

  test("rejects unknown and unsafe boundary inputs", () => {
    const base = {
      ...golden.commandBase,
      commandId: "cmd-boundary-01",
      tool: "adobe.project.get_v1",
      args: {},
    };
    for (const args of golden.rejectedArgs)
      expect(
        AdobeCommandEnvelopeV1Schema.safeParse({ ...base, args }).success,
      ).toBe(false);
    expect(
      AdobeCommandEnvelopeV1Schema.safeParse({ ...base, extra: true }).success,
    ).toBe(false);
    expect(
      AdobeCommandEnvelopeV1Schema.safeParse({
        ...base,
        tool: "adobe.layer.get_v1",
        args: { compName: "Main", layerIndex: 1 },
      }).success,
    ).toBe(false);
    expect(
      AdobeCommandEnvelopeV1Schema.safeParse({
        ...base,
        tool: "adobe.layer.get_v1",
        args: { compHandle: "comp:main", layerHandle: "layer:title" },
      }).success,
    ).toBe(false);
  });

  test("rejects unknown result and capability fields", () => {
    const result = {
      ...golden.resultBase,
      commandId: "cmd-result-01",
      changedFields: [],
      payload: {},
    };
    expect(AdobeCommandResultV1Schema.safeParse(result).success).toBe(true);
    expect(
      AdobeCommandResultV1Schema.safeParse({ ...result, token: "secret" })
        .success,
    ).toBe(false);
    const capability = {
      version: 1,
      deviceId: "device-golden",
      afterEffectsVersion: "25.0",
      capturedAt: "2026-08-30T00:00:00.000Z",
      tools: ADOBE_TOOL_NAMES_V1,
      pollingIntervalMs: 2000,
      maxConcurrentMutations: 1,
      arbitraryScripts: false,
      rawExpressions: false,
      rawPresetPaths: false,
    };
    expect(AdobeCapabilitySnapshotV1Schema.safeParse(capability).success).toBe(
      true,
    );
    expect(
      AdobeCapabilitySnapshotV1Schema.safeParse({
        ...capability,
        localPath: "/tmp",
      }).success,
    ).toBe(false);
  });
});
