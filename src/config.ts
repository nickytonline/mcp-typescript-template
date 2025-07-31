import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  SERVER_NAME: z.string().default("mcp-typescript-template"),
  SERVER_VERSION: z.string().default("1.0.0"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  
  // OAuth Configuration (optional)
  ENABLE_AUTH: z.coerce.boolean().default(false),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
  OAUTH_AUTH_ENDPOINT: z.string().optional(),
  OAUTH_TOKEN_ENDPOINT: z.string().optional(),
  OAUTH_SCOPE: z.string().default("read"),
  OAUTH_REDIRECT_URI: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

let config: Config;

export function getConfig(): Config {
  if (!config) {
    try {
      const parsed = configSchema.parse(process.env);
      
      // Validate OAuth configuration if auth is enabled
      if (parsed.ENABLE_AUTH) {
        if (!parsed.OAUTH_CLIENT_ID || !parsed.OAUTH_CLIENT_SECRET || 
            !parsed.OAUTH_AUTH_ENDPOINT || !parsed.OAUTH_TOKEN_ENDPOINT || 
            !parsed.OAUTH_REDIRECT_URI) {
          throw new Error("OAuth is enabled but missing required OAuth environment variables");
        }
      }
      
      config = parsed;
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