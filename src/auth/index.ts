import { OAuthTokenValidator } from "./token-validator.ts";
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
    return { tokenValidator: null };
  }

  if (config.AUTH_MODE === "resource_server") {
    logger.info("Initializing OAuth resource server mode");
    
    // Resource server mode: only validate tokens from external OAuth provider
    const tokenValidator = new OAuthTokenValidator(
      config.OAUTH_ISSUER!,
      config.OAUTH_AUDIENCE
    );
    
    return { tokenValidator };
  }

  if (config.AUTH_MODE === "full") {
    logger.info("Initializing OAuth full mode with external IdP delegation", {
      issuer: config.OAUTH_ISSUER,
      audience: config.OAUTH_AUDIENCE,
      clientId: config.OAUTH_CLIENT_ID
    });
    
    // Full mode: OAuth client that delegates to external IdP + resource server capabilities
    // For MCP API token validation, we need to validate OUR tokens, not external IdP tokens
    // The tokens we issue to MCP clients are from our OAuthProvider, not the external IdP
    
    // We'll create a custom validator that validates our own issued tokens
    // This needs to be handled differently - we'll return null and handle it in the middleware
    return { tokenValidator: null };
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

  // For full and resource_server modes, use token validator
  return createAuthMiddleware(tokenValidator);
}