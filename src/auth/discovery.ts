import type { Request, Response } from "express";
import { getConfig } from "../config.ts";
import { logger } from "../logger.ts";

/**
 * OAuth 2.0 Authorization Server Metadata endpoint
 * RFC 8414: https://tools.ietf.org/html/rfc8414
 */
export function createAuthorizationServerMetadataHandler() {
  return (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const metadata = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["read", "write"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        revocation_endpoint: `${baseUrl}/revoke`,
        introspection_endpoint: `${baseUrl}/introspect`,
      };

      logger.info("OAuth authorization server metadata requested", { 
        issuer: metadata.issuer 
      });

      res.json(metadata);
    } catch (error) {
      logger.error("Error serving authorization server metadata", { 
        error: error instanceof Error ? error.message : error 
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to serve authorization server metadata"
      });
    }
  };
}

/**
 * OAuth 2.0 Protected Resource Metadata endpoint
 * RFC 8705: https://tools.ietf.org/html/rfc8705
 */
export function createProtectedResourceMetadataHandler() {
  return (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const metadata = {
        resource: baseUrl,
        authorization_servers: [baseUrl],
        scopes_supported: ["read", "write"],
        bearer_methods_supported: ["header"],
        resource_documentation: `${baseUrl}/docs`,
      };

      logger.info("OAuth protected resource metadata requested", { 
        resource: metadata.resource 
      });

      res.json(metadata);
    } catch (error) {
      logger.error("Error serving protected resource metadata", { 
        error: error instanceof Error ? error.message : error 
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to serve protected resource metadata"
      });
    }
  };
}

/**
 * OAuth 2.1 token endpoint with PKCE support
 */
export function createTokenHandler(oauthProvider: any) {
  return async (req: Request, res: Response) => {
    try {
      const { grant_type, code, redirect_uri, code_verifier, client_id } = req.body;

      if (grant_type !== "authorization_code") {
        return res.status(400).json({
          error: "unsupported_grant_type",
          error_description: "Only authorization_code grant type is supported"
        });
      }

      if (!code || !redirect_uri || !code_verifier || !client_id) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters: code, redirect_uri, code_verifier, client_id"
        });
      }
      const tokenResult = await oauthProvider.exchangeAuthorizationCode(
        code, 
        code_verifier, 
        client_id, 
        redirect_uri
      );

      if (!tokenResult) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid authorization code or PKCE verification failed"
        });
      }

      logger.info("Token exchange successful", { client_id, scope: tokenResult.scope });

      res.json({
        access_token: tokenResult.accessToken,
        token_type: "Bearer",
        expires_in: tokenResult.expiresIn,
        scope: tokenResult.scope
      });

    } catch (error) {
      logger.error("Token endpoint error", { 
        error: error instanceof Error ? error.message : error 
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to process token request"
      });
    }
  };
}

/**
 * Token introspection endpoint
 */
export function createIntrospectionHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing token parameter"
        });
      }

      // TODO: Implement actual token introspection
      // For now, return active=true for any token
      logger.info("Token introspection requested", { token: token.substring(0, 10) + "..." });

      res.json({
        active: true,
        scope: "read",
        client_id: "mcp-client",
        exp: Math.floor(Date.now() / 1000) + 3600
      });

    } catch (error) {
      logger.error("Token introspection error", { 
        error: error instanceof Error ? error.message : error 
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to introspect token"
      });
    }
  };
}

/**
 * Token revocation endpoint
 */
export function createRevocationHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing token parameter"
        });
      }

      // TODO: Implement actual token revocation
      logger.info("Token revocation requested", { token: token.substring(0, 10) + "..." });

      res.status(200).send(); // Success response

    } catch (error) {
      logger.error("Token revocation error", { 
        error: error instanceof Error ? error.message : error 
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to revoke token"
      });
    }
  };
}