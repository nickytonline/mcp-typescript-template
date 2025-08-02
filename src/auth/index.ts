import { OAuthTokenValidator } from "./token-validator.ts";
import { OAuthProvider } from "./oauth-provider.ts";
import { createAuthMiddleware } from "./middleware.ts";
import { getConfig } from "../config.ts";
import { logger } from "../logger.ts";

/**
 * Initialize authentication based on AUTH_MODE
 */
export function initializeAuth() {
  const config = getConfig();

  if (config.AUTH_MODE === "none") {
    logger.info("Authentication is disabled");
    return { tokenValidator: null, oauthProvider: null };
  }

  // Both resource_server and full modes need token validation
  const tokenValidator = new OAuthTokenValidator(
    config.OAUTH_ISSUER!,
    config.OAUTH_AUDIENCE
  );

  if (config.AUTH_MODE === "resource_server") {
    logger.info("Initializing OAuth resource server mode");
    return { tokenValidator, oauthProvider: null };
  }

  if (config.AUTH_MODE === "full") {
    logger.info("Initializing OAuth full server mode with authorization endpoints");
    
    // For full mode, also set up OAuth provider for authorization flows
    const oauthProvider = new OAuthProvider({
      clientId: config.OAUTH_CLIENT_ID!,
      clientSecret: config.OAUTH_CLIENT_SECRET!,
      authorizationEndpoint: `${config.BASE_URL || "http://localhost:3000"}/oauth/authorize`,
      tokenEndpoint: `${config.BASE_URL || "http://localhost:3000"}/oauth/token`,
      scope: "read write",
      redirectUri: "http://localhost:3000/oauth/callback", // This should be configurable
    });

    return { tokenValidator, oauthProvider };
  }

  throw new Error(`Unknown AUTH_MODE: ${config.AUTH_MODE}`);
}

/**
 * Create authentication middleware based on configuration
 */
export function createAuthenticationMiddleware() {
  const { tokenValidator } = initializeAuth();

  if (!tokenValidator) {
    return (_req: any, _res: any, next: any) => next();
  }

  return createAuthMiddleware(tokenValidator);
}