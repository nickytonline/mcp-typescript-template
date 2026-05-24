import pino from "pino";
import { getConfig } from "./config.ts";

const config = getConfig();

export const logger = pino({
  level: config.LOG_LEVEL,

  // Base fields for all log entries
  base: {
    service: config.SERVER_NAME,
    version: config.SERVER_VERSION,
    environment: config.NODE_ENV,
  },

  // OpenTelemetry trace correlation
  // When OTel is present, pino will automatically include traceId and spanId
  formatters: {
    level: (label) => ({ level: label }),
  },
});
