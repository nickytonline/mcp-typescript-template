import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import { Schema } from "effect";
import { JsonObjectSchema, type JsonObject } from "./json.ts";

const JSON_SCHEMA_DIALECT = {
  "draft-07": "http://json-schema.org/draft-07/schema#",
  "draft-2020-12": "https://json-schema.org/draft/2020-12/schema",
} as const;

type SupportedJsonSchemaTarget = keyof typeof JSON_SCHEMA_DIALECT;

function withDialect(schema: JsonObject, target: string): JsonObject {
  if (!isSupportedTarget(target)) return schema;

  return { ...schema, $schema: JSON_SCHEMA_DIALECT[target] };
}

function isSupportedTarget(
  target: string,
): target is SupportedJsonSchemaTarget {
  return Object.hasOwn(JSON_SCHEMA_DIALECT, target);
}

/**
 * Adapts an Effect Schema to the Standard Schema + JSON Schema contract used
 * by the MCP SDK for tool input and output schemas.
 *
 * Effect 4 exposes the two halves separately: `toStandardSchemaV1` validates
 * and `toStandardJSONSchemaV1` advertises the schema over the wire. Effect's
 * converter omits `$schema`, so this adapter stamps the dialect URI for the
 * MCP SDK's `draft-07` and `draft-2020-12` targets.
 */
export function toMcpSchema<Output, Input = Output>(
  schema: Schema.Codec<Output, Input>,
): StandardSchemaWithJSON<Input, Output> {
  const standard = Schema.toStandardJSONSchemaV1(
    Schema.toStandardSchemaV1(schema),
  );

  const jsonSchema = standard["~standard"].jsonSchema;

  return {
    ...standard,
    "~standard": {
      ...standard["~standard"],
      jsonSchema: {
        input: (options) =>
          withDialect(
            Schema.decodeUnknownSync(JsonObjectSchema)(
              jsonSchema.input(options),
            ),
            options.target,
          ),
        output: (options) =>
          withDialect(
            Schema.decodeUnknownSync(JsonObjectSchema)(
              jsonSchema.output(options),
            ),
            options.target,
          ),
      },
    },
  };
}
