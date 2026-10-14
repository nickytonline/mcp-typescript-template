import { Effect, Logger, References, Schema } from "effect";
import { getConfig } from "./config.ts";

const config = getConfig();

type LogValue = string | number | boolean | null;

type LogFields = { readonly [key: string]: LogValue };

type LogInput = LogFields | string;

type Severity = "Error" | "Warn" | "Info" | "Debug";

function isLogMessage(value: LogInput): value is string {
  return Schema.is(Schema.String)(value);
}

const minimumLevel = {
  error: "Error",
  warn: "Warn",
  info: "Info",
  debug: "Debug",
} as const satisfies Record<ConfigLogLevel, Severity>;

type ConfigLogLevel = "error" | "warn" | "info" | "debug";

function log(level: Severity, fieldsOrMessage: LogInput, message?: string) {
  const fields = isLogMessage(fieldsOrMessage) ? {} : fieldsOrMessage;

  const text = isLogMessage(fieldsOrMessage)
    ? fieldsOrMessage
    : (message ?? "");

  return Effect.logWithLevel(level)(text).pipe(
    Effect.annotateLogs({
      service: config.SERVER_NAME,
      version: config.SERVER_VERSION,
      environment: config.NODE_ENV,
      ...fields,
    }),
    Effect.provideService(References.MinimumLogLevel)(
      minimumLevel[config.LOG_LEVEL],
    ),
    Effect.provide(Logger.layer([Logger.consoleJson])),
  );
}

/** Structured Effect logging used by the server and tool workflows. */
export const logger = {
  debug: (fieldsOrMessage: LogInput, message?: string) =>
    log("Debug", fieldsOrMessage, message),
  info: (fieldsOrMessage: LogInput, message?: string) =>
    log("Info", fieldsOrMessage, message),
  warn: (fieldsOrMessage: LogInput, message?: string) =>
    log("Warn", fieldsOrMessage, message),
  error: (fieldsOrMessage: LogInput, message?: string) =>
    log("Error", fieldsOrMessage, message),
};
