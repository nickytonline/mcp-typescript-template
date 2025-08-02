import { z } from "zod";

const configSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  SERVER_NAME: z.string().default("mcp-typescript-template"),
  SERVER_VERSION: z.string().default("1.0.0"),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

  // Authentication Configuration (optional)
  ENABLE_AUTH: z.preprocess((val) => {
    // Handle string-to-boolean conversion properly
    if (typeof val === "string") {
      return val.toLowerCase() === "true";
    }
    return val;
  }, z.boolean().default(false)),
  
  // Auth mode: "gateway" (resource server) or "builtin" (authorization server)
  AUTH_MODE: z.enum(["gateway", "builtin"]).default("gateway"),
  
  // Gateway mode: External OAuth provider token validation
  OAUTH_ISSUER: z.string().optional(), // OAuth issuer URL for token validation
  OAUTH_AUDIENCE: z.string().optional(), // Expected audience in JWT tokens
  
  // Built-in mode: OAuth server configuration (for testing/demos)
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

      // Only validate auth configuration if auth is explicitly enabled
      if (parsed.ENABLE_AUTH === true) {
        if (parsed.AUTH_MODE === "gateway") {
          // Gateway mode: validate token validation config
          if (!parsed.OAUTH_ISSUER) {
            throw new Error(
              "Gateway auth mode requires OAUTH_ISSUER for token validation. " +
              "Set OAUTH_ISSUER to your OAuth provider's issuer URL (e.g., https://your-domain.auth0.com)"
            );
          }
        } else if (parsed.AUTH_MODE === "builtin") {
          // Built-in mode: validate OAuth server config
          const missingVars = [];
          if (!parsed.OAUTH_CLIENT_ID) missingVars.push("OAUTH_CLIENT_ID");
          if (!parsed.OAUTH_CLIENT_SECRET) missingVars.push("OAUTH_CLIENT_SECRET");
          if (!parsed.OAUTH_AUTH_ENDPOINT) missingVars.push("OAUTH_AUTH_ENDPOINT");
          if (!parsed.OAUTH_TOKEN_ENDPOINT) missingVars.push("OAUTH_TOKEN_ENDPOINT");
          if (!parsed.OAUTH_REDIRECT_URI) missingVars.push("OAUTH_REDIRECT_URI");
          
          if (missingVars.length > 0) {
            throw new Error(
              `Built-in auth mode requires OAuth configuration. Missing: ${missingVars.join(", ")}`
            );
          }
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
