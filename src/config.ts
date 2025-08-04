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

  // OAuth configuration for external IdP integration
  OAUTH_ISSUER: z.string().optional(),
  OAUTH_CLIENT_ID: z.string().optional(),
  OAUTH_CLIENT_SECRET: z.string().optional(),
  OAUTH_AUDIENCE: z.string().optional(),
  OAUTH_REDIRECT_URI: z.string().optional(),
  OAUTH_SCOPE: z.string().default("openid profile email"),
});

export type Config = z.infer<typeof configSchema> & {
  BASE_URL: string;
};

let config: Config;

export function getConfig(): Config {
  if (!config) {
    try {
      const parsed = configSchema.parse(process.env);

      if (!parsed.BASE_URL) {
        parsed.BASE_URL = `http://localhost:${parsed.PORT}`;
      }

      // Full mode validation - OAuth Authorization Server with external IdP
      if (parsed.AUTH_MODE === "full") {
        const requiredVars = [];
        if (!parsed.OAUTH_ISSUER) requiredVars.push("OAUTH_ISSUER");
        if (!parsed.OAUTH_CLIENT_ID) requiredVars.push("OAUTH_CLIENT_ID");
        if (!parsed.OAUTH_CLIENT_SECRET)
          requiredVars.push("OAUTH_CLIENT_SECRET");

        // Provide default for OAUTH_REDIRECT_URI if not set
        if (!parsed.OAUTH_REDIRECT_URI) {
          const callbackUrl = new URL("/callback", parsed.BASE_URL);
          parsed.OAUTH_REDIRECT_URI = callbackUrl.toString();
          console.log(
            `⚠️  OAUTH_REDIRECT_URI not set, using default: ${parsed.OAUTH_REDIRECT_URI}`,
          );
        }

        if (requiredVars.length > 0) {
          throw new Error(
            `AUTH_MODE=full requires OAuth configuration. Missing: ${requiredVars.join(", ")}\n` +
              "Example configuration:\n" +
              "OAUTH_ISSUER=https://your-domain.auth0.com\n" +
              "OAUTH_CLIENT_ID=your-client-id\n" +
              "OAUTH_CLIENT_SECRET=your-client-secret\n" +
              "OAUTH_REDIRECT_URI=http://localhost:3000/callback  # Optional, defaults to BASE_URL/callback or http://localhost:PORT/callback\n" +
              "OAUTH_AUDIENCE=your-api-identifier  # Optional but recommended",
          );
        }

        // OAUTH_AUDIENCE is optional but recommended when a resource server is used
        if (!parsed.OAUTH_AUDIENCE) {
          console.warn(
            "⚠️  OAUTH_AUDIENCE not set for full mode. Token validation will not check audience.\n" +
              "   For production deployments, consider setting OAUTH_AUDIENCE to your API identifier",
          );
        }
      }

      if (parsed.AUTH_MODE === "resource_server") {
        const requiredVars = [];
        if (!parsed.OAUTH_ISSUER) requiredVars.push("OAUTH_ISSUER");
        if (!parsed.OAUTH_AUDIENCE) requiredVars.push("OAUTH_AUDIENCE");

        if (requiredVars.length > 0) {
          throw new Error(
            `AUTH_MODE=resource_server requires OAuth configuration. Missing: ${requiredVars.join(", ")}\n` +
              "Example configuration:\n" +
              "OAUTH_ISSUER=https://your-domain.auth0.com\n" +
              "OAUTH_AUDIENCE=your-api-identifier",
          );
        }
      }

      config = parsed as Config;
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
