import { z } from "zod";

const configSchema = z
  .object({
    PORT: z.coerce.number().default(3000),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    SERVER_NAME: z.string().default("mcp-typescript-template"),
    SERVER_VERSION: z.string().default("1.0.0"),
    LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

    BASE_URL: z.string().optional(),
    ENABLE_AUTH: z
      .string()
      .optional()
      .default("false")
      .transform((val) => val === "true"),

    // OAuth configuration - validated by superRefine when ENABLE_AUTH=true
    OAUTH_ISSUER: z.string().optional(),
    OAUTH_CLIENT_ID: z.string().optional(),
    OAUTH_CLIENT_SECRET: z.string().optional(),
    OAUTH_AUDIENCE: z.string().optional(), // Optional but recommended for production
    OAUTH_REDIRECT_URI: z.string().optional(), // Defaults to BASE_URL/callback
    OAUTH_SCOPE: z.string().default("openid profile email"),

    // MCP Client ID - public client ID (no secret needed with PKCE)
    MCP_CLIENT_ID: z.string().default("mcp-client"),
  })
  .superRefine((data, ctx) => {
    // Validate OAuth fields when authentication is enabled
    if (data.ENABLE_AUTH) {
      if (!data.OAUTH_ISSUER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OAUTH_ISSUER"],
          message: "OAUTH_ISSUER is required when ENABLE_AUTH=true",
        });
      }
      if (!data.OAUTH_CLIENT_ID) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OAUTH_CLIENT_ID"],
          message: "OAUTH_CLIENT_ID is required when ENABLE_AUTH=true",
        });
      }
      if (!data.OAUTH_CLIENT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["OAUTH_CLIENT_SECRET"],
          message: "OAUTH_CLIENT_SECRET is required when ENABLE_AUTH=true",
        });
      }
    }
  })
  .transform((data) => {
    // Compute BASE_URL default if not provided
    const baseUrl = data.BASE_URL || `http://localhost:${data.PORT}`;

    // Compute OAUTH_REDIRECT_URI default if not provided and auth is enabled
    let redirectUri = data.OAUTH_REDIRECT_URI;
    if (!redirectUri && data.ENABLE_AUTH) {
      try {
        const callbackUrl = new URL("/callback", baseUrl);
        redirectUri = callbackUrl.toString();
        console.log(
          `ℹ️  OAUTH_REDIRECT_URI not set, using default: ${redirectUri}`,
        );
      } catch (error) {
        // If URL construction fails, leave it undefined
        // Will be caught by validation later if needed
      }
    }

    return {
      ...data,
      BASE_URL: baseUrl,
      OAUTH_REDIRECT_URI: redirectUri,
    };
  });

type BaseConfig = z.infer<typeof configSchema>;

export type Config =
  | (BaseConfig & {
      ENABLE_AUTH: false;
      BASE_URL: string;
      MCP_CLIENT_ID: string;
    })
  | (BaseConfig & {
      ENABLE_AUTH: true;
      BASE_URL: string;
      OAUTH_ISSUER: string;
      OAUTH_CLIENT_ID: string;
      OAUTH_CLIENT_SECRET: string;
      OAUTH_REDIRECT_URI: string;
      MCP_CLIENT_ID: string;
    });

let config: Config;

export function getConfig(): Config {
  if (!config) {
    try {
      const parsed = configSchema.parse(process.env);

      console.log(
        `🔐 Authentication: ${parsed.ENABLE_AUTH ? "ENABLED" : "DISABLED"}`,
      );

      // OAUTH_AUDIENCE is optional but recommended for production
      if (parsed.ENABLE_AUTH && !parsed.OAUTH_AUDIENCE) {
        console.warn(
          `⚠️  OAUTH_AUDIENCE not set. Token validation will not check audience.
   For production deployments, consider setting OAUTH_AUDIENCE to your API identifier`,
        );
      }

      config = parsed as Config;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("❌ Invalid environment configuration:");
        error.issues.forEach((issue) => {
          console.error(`   - ${issue.path.join(".")}: ${issue.message}`);
        });
        console.error("\nExample configuration:");
        console.error("ENABLE_AUTH=true");
        console.error("OAUTH_ISSUER=https://your-domain.auth0.com");
        console.error("OAUTH_CLIENT_ID=your-client-id");
        console.error("OAUTH_CLIENT_SECRET=your-client-secret");
        console.error(
          "OAUTH_AUDIENCE=your-api-identifier  # Optional but recommended",
        );
      } else {
        console.error("❌ Invalid environment configuration:", error);
      }
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
