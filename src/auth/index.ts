import { OAuthProvider, OAuthConfig } from "./oauth-provider.js";
import { createOAuthMiddleware, createOptionalOAuthMiddleware } from "./middleware.js";
import { getConfig } from "../config.js";

export { OAuthProvider, type OAuthConfig, type AuthenticatedRequest } from "./oauth-provider.js";
export { createOAuthMiddleware, createOptionalOAuthMiddleware } from "./middleware.js";

/**
 * Initialize OAuth provider if authentication is enabled
 */
export function initializeAuth() {
  const config = getConfig();
  
  if (!config.ENABLE_AUTH) {
    return null;
  }

  const oauthConfig: OAuthConfig = {
    clientId: config.OAUTH_CLIENT_ID!,
    clientSecret: config.OAUTH_CLIENT_SECRET!,
    authorizationEndpoint: config.OAUTH_AUTH_ENDPOINT!,
    tokenEndpoint: config.OAUTH_TOKEN_ENDPOINT!,
    scope: config.OAUTH_SCOPE || "read",
    redirectUri: config.OAUTH_REDIRECT_URI!,
  };

  return new OAuthProvider(oauthConfig);
}

/**
 * Create authentication middleware based on configuration
 */
export function createAuthMiddleware() {
  const oauthProvider = initializeAuth();
  
  if (!oauthProvider) {
    // Return pass-through middleware when auth is disabled
    return (_req: any, _res: any, next: any) => next();
  }

  return createOAuthMiddleware(oauthProvider);
}