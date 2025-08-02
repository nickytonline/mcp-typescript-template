import { ManagedOAuthServer } from "./oauth-server.ts";
import { GatewayTokenValidator, BuiltinTokenValidator } from "./token-validator.ts";
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
    return { tokenValidator: null, oauthServer: null };
  }

  if (config.AUTH_MODE === "gateway") {
    logger.info("Initializing gateway auth mode (resource server)");
    const tokenValidator = new GatewayTokenValidator(
      config.OAUTH_ISSUER!,
      config.OAUTH_AUDIENCE
    );
    return { tokenValidator, oauthServer: null };
  }

  if (config.AUTH_MODE === "builtin") {
    logger.info("Initializing built-in auth mode (OAuth authorization server)");
    const oauthServer = new ManagedOAuthServer();
    const tokenValidator = new BuiltinTokenValidator(oauthServer);
    return { tokenValidator, oauthServer };
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
