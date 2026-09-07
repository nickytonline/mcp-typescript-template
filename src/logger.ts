import { Effect, LogLevel, Logger } from "effect";
import { getConfig } from "./config.ts";

const config = getConfig();

type LogFields = Readonly<Record<string, unknown>>;
type LogInput = LogFields | string;

const minimumLevel: Record<ConfigLogLevel, LogLevel.LogLevel> = {
  error: LogLevel.Error,
  warn: LogLevel.Warning,
  info: LogLevel.Info,
  debug: LogLevel.Debug,
};

type ConfigLogLevel = "error" | "warn" | "info" | "debug";

function log(level: LogLevel.LogLevel, fieldsOrMessage: LogInput, message?: string) {
  const fields = typeof fieldsOrMessage === "string" ? {} : fieldsOrMessage;
  const text = typeof fieldsOrMessage === "string" ? fieldsOrMessage : (message ?? "");

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
