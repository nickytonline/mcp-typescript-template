import { Schema } from "effect";

export type JsonObject = { [key: string]: JsonValue };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonObject;

export const Json: Schema.Codec<JsonValue> = Schema.suspend(
  (): Schema.Codec<JsonValue> =>
    Schema.Union([
      Schema.String,
      Schema.Number,
      Schema.Boolean,
      Schema.Null,
      Schema.Array(Json),
      JsonObjectSchema,
    ]),
);

export const JsonObjectSchema: Schema.Codec<JsonObject> = Schema.suspend(
  (): Schema.Codec<JsonObject> => Schema.Record(Schema.String, Json),
);
