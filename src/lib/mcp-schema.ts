import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { JSONSchema, Schema } from "effect";

type McpJsonSchemaOptions = Parameters<
  StandardSchemaWithJSON["~standard"]["jsonSchema"]["input"]
>[0];

function toEffectJsonSchemaTarget(
  target: McpJsonSchemaOptions["target"],
): "jsonSchema7" | "jsonSchema2020-12" {
  switch (target) {
    case "draft-07":
      return "jsonSchema7";
    case "draft-2020-12":
      return "jsonSchema2020-12";
    default:
      throw new Error(
        `Unsupported MCP JSON Schema target: ${String(target)}. Effect supports draft-07 and draft-2020-12.`,
      );
  }
}

function makeMcpJsonSchema<Output, Input>(
  schema: Schema.Schema<Output, Input>,
  options: McpJsonSchemaOptions,
): Record<string, unknown> {
  return JSONSchema.make(schema, {
    target: toEffectJsonSchemaTarget(options.target),
  }) as unknown as Record<string, unknown>;
}

/**
 * Adapts an Effect Schema to the Standard Schema + JSON Schema contract used
 * by the MCP SDK for tool input and output schemas.
 *
 * Effect already implements Standard Schema validation. The MCP SDK also
 * needs the companion JSON Schema converter to advertise schemas over the
 * wire, so this adapter supplies that one additional capability.
 */
export function toMcpSchema<Output, Input = Output>(
  schema: Schema.Schema<Output, Input>,
): StandardSchemaWithJSON<Input, Output> {
  const standard = Schema.standardSchemaV1(schema);

  const adapted = {
    ...standard,
    "~standard": {
      ...standard["~standard"],
      jsonSchema: {
        input: (options) => makeMcpJsonSchema(schema, options),
        output: (options) => makeMcpJsonSchema(schema, options),
      },
    },
  } satisfies StandardSchemaWithJSON<Input, Output>;

  return adapted;
}
