import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SERVER_NAME: z.string().default("mcp-typescript-template"),
  SERVER_VERSION: z.string().default("1.0.0"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  // Sampling configuration
  SAMPLING_ENABLED: z.coerce.boolean().default(true),
  SAMPLING_TIMEOUT_MS: z.coerce.number().min(1000).max(300000).default(30000),
  SAMPLING_MAX_TOKENS_DEFAULT: z.coerce.number().min(1).max(10000).default(1000),
  SAMPLING_TEMPERATURE_DEFAULT: z.coerce.number().min(0).max(1).default(0.5),
  SAMPLING_LOG_REQUESTS: z.coerce.boolean().default(true),
  SAMPLING_LOG_USAGE: z.coerce.boolean().default(true),
});

export type Config = z.infer<typeof configSchema>;

let config: Config;

export function getConfig(): Config {
  if (!config) {
    try {
      config = configSchema.parse(process.env);
    } catch (error) {
      console.error("❌ Invalid environment configuration:", error);
      process.exit(1);
    }
  }
  return config;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === "development";
}