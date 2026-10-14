import { Effect, LogLevel, Logger, ParseResult, Schema } from "effect";
import { getConfig } from "./config.ts";

const config = getConfig();

type LogValue = string | number | boolean | null;

type LogFields = { readonly [key: string]: LogValue };

type LogInput = LogFields | string;

function isLogMessage(value: LogInput): value is string {
  return ParseResult.is(Schema.String)(value);
}

const minimumLevel = {
  error: LogLevel.Error,
  warn: LogLevel.Warning,
  info: LogLevel.Info,
  debug: LogLevel.Debug,
} satisfies Record<ConfigLogLevel, LogLevel.LogLevel>;

type ConfigLogLevel = "error" | "warn" | "info" | "debug";

function log(
  level: LogLevel.LogLevel,
  fieldsOrMessage: LogInput,
  message?: string,
) {
  const fields = isLogMessage(fieldsOrMessage) ? {} : fieldsOrMessage;

  const text = isLogMessage(fieldsOrMessage)
    ? fieldsOrMessage
    : (message ?? "");

  return Effect.logWithLevel(level, text).pipe(
    Effect.annotateLogs({
      service: config.SERVER_NAME,
      version: config.SERVER_VERSION,
      environment: config.NODE_ENV,
      ...fields,
    }),
    Logger.withMinimumLogLevel(minimumLevel[config.LOG_LEVEL]),
    Effect.provide(Logger.json),
  );
}

/** Structured Effect logging used by the server and tool workflows. */
export const logger = {
  debug: (fieldsOrMessage: LogInput, message?: string) =>
    log(LogLevel.Debug, fieldsOrMessage, message),
  info: (fieldsOrMessage: LogInput, message?: string) =>
    log(LogLevel.Info, fieldsOrMessage, message),
  warn: (fieldsOrMessage: LogInput, message?: string) =>
    log(LogLevel.Warning, fieldsOrMessage, message),
  error: (fieldsOrMessage: LogInput, message?: string) =>
    log(LogLevel.Error, fieldsOrMessage, message),
};
