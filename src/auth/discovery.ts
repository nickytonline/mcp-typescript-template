import type { Request, Response } from "express";
import OAuth2Server from "@node-oauth/oauth2-server";
import { getConfig } from "../config.ts";
import { logger } from "../logger.ts";

/**
 * OAuth 2.0 Authorization Server Metadata endpoint
 * RFC 8414: https://tools.ietf.org/html/rfc8414
 *
 * For AUTH_MODE=full, this describes our OAuth client proxy endpoints
 */
export function createAuthorizationServerMetadataHandler() {
  return (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const metadata = {
        issuer: baseUrl,
        authorization_endpoint: new URL("/oauth/authorize", baseUrl).toString(),
        token_endpoint: new URL("/oauth/token", baseUrl).toString(),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["read", "write", "mcp"],
        token_endpoint_auth_methods_supported: ["none"],
      };

      logger.info("OAuth authorization server metadata requested", {
        issuer: metadata.issuer,
      });

      res.json(metadata);
    } catch (error) {
      logger.error("Error serving authorization server metadata", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to serve authorization server metadata",
      });
    }
  };
}

/**
 * OAuth 2.0 Protected Resource Metadata endpoint
 * RFC 8705: https://tools.ietf.org/html/rfc8705
 *
 * For AUTH_MODE=full, this describes our resource server capabilities
 */
export function createProtectedResourceMetadataHandler() {
  return (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      const metadata = {
        resource: baseUrl,
        authorization_servers: [baseUrl],
        scopes_supported: ["read", "write", "mcp"],
        bearer_methods_supported: ["header"],
        resource_documentation: new URL("/docs", baseUrl).toString(),
      };

      logger.info("OAuth protected resource metadata requested", {
        resource: metadata.resource,
      });

      res.json(metadata);
    } catch (error) {
      logger.error("Error serving protected resource metadata", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to serve protected resource metadata",
      });
    }
  };
}

/**
 * OAuth 2.0 Authorization endpoint
 */
export function createAuthorizeHandler(oauthServer: OAuth2Server) {
  return async (req: Request, res: Response) => {
    try {
      logger.debug("Authorization request received", {
        query: req.query,
        method: req.method,
      });

      // Real OAuth implementation: Check for authenticated user
      // In a real implementation, this would:
      // 1. Check if user has valid session/cookie
      // 2. If not authenticated, redirect to login page
      // 3. After login, show consent page
      // 4. Only then proceed with authorization

      // For now, this implementation requires external authentication
      // The user must be authenticated before reaching this endpoint
      const userId = req.headers["x-user-id"] as string;
      const username = req.headers["x-username"] as string;

      if (!userId || !username) {
        logger.warn("Missing user authentication headers");
        return res.status(401).json({
          error: "access_denied",
          error_description: "User must be authenticated before authorization",
        });
      }

      const user = {
        id: userId,
        username: username,
      };

      logger.debug("User authenticated, proceeding with authorization", {
        userId: user.id,
      });

      // Use the OAuth2Server authorize method
      const request = new (OAuth2Server as any).Request(req);
      const response = new (OAuth2Server as any).Response(res);

      const authorizationCode = await oauthServer.authorize(request, response, {
        authenticateHandler: {
          handle: async () => {
            logger.debug("Authenticate handler called");
            return user;
          },
        },
      });

      logger.info("Authorization code granted", {
        clientId: authorizationCode.client.id,
        userId: user.id,
      });

      // Redirect back to client with authorization code
      const redirectUri = req.query.redirect_uri as string;
      const state = req.query.state as string;

      if (redirectUri) {
        const url = new URL(redirectUri);
        url.searchParams.set("code", authorizationCode.authorizationCode);
        if (state) url.searchParams.set("state", state);

        logger.info("Redirecting to client", { redirectUrl: url.toString() });
        res.redirect(url.toString());
      } else {
        // Fallback - return as JSON
        res.json({
          authorization_code: authorizationCode.authorizationCode,
          state,
        });
      }
    } catch (error) {
      logger.error("Authorization endpoint error", {
        error: error instanceof Error ? error.message : error,
        stack: error instanceof Error ? error.stack : undefined,
      });

      res.status(400).json({
        error: "server_error",
        error_description:
          error instanceof Error
            ? error.message
            : "Failed to process authorization request",
      });
    }
  };
}

/**
 * OAuth 2.0 Token endpoint
 */
export function createTokenHandler(oauthServer: OAuth2Server) {
  return async (req: Request, res: Response) => {
    try {
      const request = new (OAuth2Server as any).Request(req);
      const response = new (OAuth2Server as any).Response(res);

      const token = await oauthServer.token(request, response);

      logger.info("Access token granted", {
        clientId: token.client.id,
        userId: token.user?.id,
        scope: token.scope,
      });

      res.json({
        access_token: token.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(
          (token.accessTokenExpiresAt!.getTime() - Date.now()) / 1000,
        ),
        scope: Array.isArray(token.scope) ? token.scope.join(" ") : token.scope,
        refresh_token: token.refreshToken,
      });
    } catch (error) {
      logger.error("Token endpoint error", {
        error: error instanceof Error ? error.message : error,
      });

      res.status(400).json({
        error: "invalid_request",
        error_description:
          error instanceof Error ? error.message : "Token request failed",
      });
    }
  };
}

/**
 * Token introspection endpoint
 */
export function createIntrospectionHandler(oauthServer: OAuth2Server) {
  return async (req: Request, res: Response) => {
    try {
      const request = new (OAuth2Server as any).Request(req);
      const response = new (OAuth2Server as any).Response(res);

      const token = await oauthServer.authenticate(request, response);

      logger.info("Token introspection successful", {
        clientId: token.client.id,
        userId: token.user?.id,
        scope: token.scope,
      });

      res.json({
        active: true,
        scope: Array.isArray(token.scope) ? token.scope.join(" ") : token.scope,
        client_id: token.client.id,
        username: token.user?.username,
        sub: token.user?.id,
        exp: Math.floor((token.accessTokenExpiresAt?.getTime() || 0) / 1000),
      });
    } catch (error) {
      logger.debug("Token introspection failed", {
        error: error instanceof Error ? error.message : error,
      });

      res.json({ active: false });
    }
  };
}

/**
 * Token revocation endpoint
 */
export function createRevocationHandler(oauthServer: OAuth2Server) {
  return async (req: Request, res: Response) => {
    try {
      const request = new (OAuth2Server as any).Request(req);
      const response = new (OAuth2Server as any).Response(res);

      await oauthServer.revoke(request, response);

      logger.info("Token revoked successfully");
      res.status(200).send();
    } catch (error) {
      logger.error("Token revocation error", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(400).json({
        error: "invalid_request",
        error_description: "Failed to revoke token",
      });
    }
  };
}
