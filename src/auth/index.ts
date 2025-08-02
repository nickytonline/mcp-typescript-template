import { OAuthProvider, type OAuthConfig } from "./oauth-provider.ts";
import { GatewayTokenValidator } from "./token-validator.ts";
import { createAuthMiddleware } from "./middleware.ts";
import { getConfig } from "../config.ts";
import { logger } from "../logger.ts";

/**
 * Initialize authentication based on mode
 */
export function initializeAuth() {
  const config = getConfig();

  if (!config.ENABLE_AUTH) {
    logger.info("Authentication is disabled");
    return { tokenValidator: null, oauthProvider: null };
  }

  if (config.AUTH_MODE === "gateway") {
    logger.info("Initializing gateway auth mode (resource server)");
    const tokenValidator = new GatewayTokenValidator(
      config.OAUTH_ISSUER!,
      config.OAUTH_AUDIENCE
    );
    return { tokenValidator, oauthProvider: null };
  }

  if (config.AUTH_MODE === "builtin") {
    logger.info("Initializing built-in auth mode (OAuth client + resource server)");
    const oauthConfig: OAuthConfig = {
      clientId: config.OAUTH_CLIENT_ID!,
      clientSecret: config.OAUTH_CLIENT_SECRET!,
      authorizationEndpoint: config.OAUTH_AUTH_ENDPOINT!,
      tokenEndpoint: config.OAUTH_TOKEN_ENDPOINT!,
      scope: config.OAUTH_SCOPE || "read",
      redirectUri: config.OAUTH_REDIRECT_URI!,
    };

    const oauthProvider = new OAuthProvider(oauthConfig);
    return { tokenValidator: oauthProvider.tokenValidator, oauthProvider };
  }

  throw new Error(`Unknown auth mode: ${config.AUTH_MODE}`);
}

/**
 * Create authentication middleware based on configuration
 */
export function createAuthenticationMiddleware() {
  const { tokenValidator } = initializeAuth();

  if (!tokenValidator) {
    // Return pass-through middleware when auth is disabled
    return (_req: any, _res: any, next: any) => next();
  }

  return createAuthMiddleware(tokenValidator);
}
