import { describe, expect, test } from "vitest";
import golden from "../../../verification/contract/adobe-mcp-v1.json" with { type: "json" };
import {
  ADOBE_TOOL_NAMES_V1,
  AdobeCommandEnvelopeV1Schema,
  AdobeCommandResultV1Schema,
  AdobeDeviceEnrollmentRequestV1Schema,
  AdobeRelayRequestV1Schema,
  AdobeRelaySignatureV1Schema,
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

  test("rejects unknown result fields", () => {
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
  });

  test("rejects malformed bindings numbers enums and nested batch fields", () => {
    const base = {
      ...golden.commandBase,
      commandId: "cmd-deep-boundary",
    };
    for (const candidate of [
      { ...base, nonce: "", tool: "adobe.project.get_v1", args: {} },
      { ...base, deviceId: "", tool: "adobe.project.get_v1", args: {} },
      { ...base, jobId: "", tool: "adobe.project.get_v1", args: {} },
      {
        ...base,
        tool: "adobe.composition.create_v1",
        args: {
          name: "Main",
          width: "1920",
          height: 1080,
          durationSeconds: 15,
          frameRate: 30,
        },
      },
      {
        ...base,
        tool: "adobe.mask.set_v1",
        args: {
          compHandle: "comp:1",
          layerHandle: "layer:1",
          mode: "replace",
          vertices: [
            [0, 0],
            [1, 0],
            [1, 1],
          ],
        },
      },
      {
        ...base,
        tool: "adobe.layer.batch_set_properties_v1",
        args: {
          compHandle: "comp:1",
          layers: [
            {
              layerHandle: "layer:1",
              properties: { "ADBE Opacity": 80 },
              surprise: true,
            },
          ],
        },
      },
    ])
      expect(AdobeCommandEnvelopeV1Schema.safeParse(candidate).success).toBe(
        false,
      );
  });
});

describe("Adobe cloud relay boundary", () => {
  const command = golden.commandBase;

  test("rejects unknown relay enrollment and signature fields", () => {
    const relayCommand = {
      ...command,
      commandId: "cmd-relay-1",
      tool: "adobe.project.get_v1",
      args: {},
    };
    expect(
      AdobeRelayRequestV1Schema.safeParse({ version: 1, command: relayCommand })
        .success,
    ).toBe(true);
    expect(
      AdobeRelayRequestV1Schema.safeParse({
        version: 1,
        command: relayCommand,
        token: "x",
      }).success,
    ).toBe(false);
    expect(
      AdobeDeviceEnrollmentRequestV1Schema.safeParse({
        name: "Studio Mac",
        localPath: "/private/project.aep",
      }).success,
    ).toBe(false);
    expect(
      AdobeRelaySignatureV1Schema.safeParse({
        keyId: "key-1",
        timestampMs: 1,
        requestId: "request-1",
        nonce: "nonce-1",
        bodyHash: "a".repeat(64),
        signature: "b".repeat(64),
      }).success,
    ).toBe(true);
    expect(
      AdobeRelaySignatureV1Schema.safeParse({
        keyId: "key-1",
        timestampMs: 1,
        requestId: "request-1",
        nonce: "nonce-1",
        bodyHash: "a".repeat(64),
        signature: "b".repeat(64),
        accessToken: "forbidden",
      }).success,
    ).toBe(false);
  });
});
