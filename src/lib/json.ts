import { Schema } from "effect";

export type JsonObject = { [key: string]: JsonValue };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | JsonObject;

export const Json: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(Json),
    JsonObjectSchema,
  ),
);

export const JsonObjectSchema: Schema.Schema<JsonObject> = Schema.suspend(() =>
  Schema.Record({ key: Schema.String, value: Json }),
);
