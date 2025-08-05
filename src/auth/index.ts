import { OAuthTokenValidator } from "./token-validator.ts";
import { createAuthMiddleware } from "./middleware.ts";
import { getConfig } from "../config.ts";
import { logger } from "../logger.ts";

/**
 * Initialize authentication based on ENABLE_AUTH
 */
export function initializeAuth() {
  const config = getConfig();

  if (!config.ENABLE_AUTH) {
    logger.info("Authentication is disabled");
    return { tokenValidator: null };
  }

  logger.info("Initializing OAuth 2.1 authentication with token validation", {
    issuer: config.OAUTH_ISSUER,
    audience: config.OAUTH_AUDIENCE,
    clientId: config.OAUTH_CLIENT_ID,
  });

  // Create token validator for OAuth 2.1 token validation
  const tokenValidator = new OAuthTokenValidator(
    config.OAUTH_ISSUER!,
    config.OAUTH_AUDIENCE,
  );

  return { tokenValidator };
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
