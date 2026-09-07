import { describe, expect, it } from "vitest";
import { Schema } from "effect";
import { toMcpSchema } from "./mcp-schema.ts";

const schema = toMcpSchema(
  Schema.Struct({
    message: Schema.String,
  }),
);

describe("toMcpSchema", () => {
  it("validates input using Effect Schema", async () => {
    const valid = await schema["~standard"].validate({ message: "hello" });
    expect(valid).toEqual({ value: { message: "hello" } });

    const invalid = await schema["~standard"].validate({ message: 42 });
    expect(invalid).toMatchObject({ issues: expect.any(Array) });
  });

  it("generates draft-07 JSON Schema", () => {
    const jsonSchema = schema["~standard"].jsonSchema.input({
      target: "draft-07",
    });

    expect(jsonSchema).toMatchObject({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
    });
  });

  it("generates draft-2020-12 JSON Schema", () => {
    const jsonSchema = schema["~standard"].jsonSchema.input({
      target: "draft-2020-12",
    });

    expect(jsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
    });
  });

  it("generates output JSON Schema", () => {
    const jsonSchema = schema["~standard"].jsonSchema.output({
      target: "draft-07",
    });

    expect(jsonSchema).toMatchObject({
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
    });
  });

  it("rejects unsupported JSON Schema targets", () => {
    expect(() =>
      schema["~standard"].jsonSchema.input({ target: "openapi-3.0" }),
    ).toThrow("Unsupported MCP JSON Schema target");
  });
});
