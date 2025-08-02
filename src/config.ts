import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SERVER_NAME: z.string().default("mcp-typescript-template"),
  SERVER_VERSION: z.string().default("1.0.0"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  BASE_URL: z.string().optional(),
  AUTH_MODE: z.enum(["none", "full", "resource_server"]).default("none"),

  OAUTH_ISSUER: z.string().optional(),
  OAUTH_AUDIENCE: z.string().optional(),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
});

export type Config = z.infer<typeof configSchema>;

let config: Config;

export function getConfig(): Config {
  if (!config) {
    try {
      const parsed = configSchema.parse(process.env);

      if (parsed.AUTH_MODE === "full") {
        const missingVars = [];
        if (!parsed.OAUTH_ISSUER) missingVars.push("OAUTH_ISSUER");
        if (!parsed.OAUTH_CLIENT_ID) missingVars.push("OAUTH_CLIENT_ID");
        if (!parsed.OAUTH_CLIENT_SECRET)
          missingVars.push("OAUTH_CLIENT_SECRET");

        if (missingVars.length > 0) {
          throw new Error(
            `AUTH_MODE=full requires complete OAuth configuration. Missing: ${missingVars.join(", ")}\n` +
              "Set these in your .env file:\n" +
              "OAUTH_ISSUER=https://your-issuer.com\n" +
              "OAUTH_CLIENT_ID=your-some-idp-client-id\n" +
              "OAUTH_CLIENT_SECRET=your-some-idp-client-secret",
          );
        }
      }

      if (
        parsed.AUTH_MODE === "resource_server" ||
        parsed.AUTH_MODE === "full"
      ) {
        if (!parsed.OAUTH_ISSUER) {
          throw new Error(
            `AUTH_MODE=${parsed.AUTH_MODE} requires OAUTH_ISSUER for JWT token validation.\n` +
              "Set OAUTH_ISSUER=https://your-issuer.com",
          );
        }
      }

      // OAuth audience validation: required for resource_server, optional but recommended for full
      if (parsed.AUTH_MODE === "resource_server") {
        if (!parsed.OAUTH_AUDIENCE) {
          throw new Error(
            "AUTH_MODE=resource_server requires OAUTH_AUDIENCE for token validation.\n" +
              "Set OAUTH_AUDIENCE to your API identifier (e.g., 'mcp-server')",
          );
        }
      } else if (parsed.AUTH_MODE === "full") {
        if (!parsed.OAUTH_AUDIENCE) {
          console.warn(
            "⚠️  OAUTH_AUDIENCE not set for full mode. Tokens will not be validated for intended audience.\n" +
              "   For production deployments, consider setting OAUTH_AUDIENCE to your API identifier (e.g., 'mcp-server')",
          );
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
