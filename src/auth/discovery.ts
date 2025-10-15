import type { Request, Response } from "express";
import { logger } from "../logger.ts";
import { getConfig } from "../config.ts";

/**
 * OAuth 2.0 Authorization Server Metadata endpoint
 * RFC 8414: https://tools.ietf.org/html/rfc8414
 *
 * Points to the external OAuth provider (e.g., Auth0) so clients authenticate directly
 */
export function createAuthorizationServerMetadataHandler() {
  return (req: Request, res: Response) => {
    try {
      const config = getConfig();

      if (!config.ENABLE_AUTH) {
        return res.status(500).json({
          error: "server_error",
          error_description: "Authentication not configured",
        });
      }

      // Point to the external OAuth provider (Auth0) directly
      const metadata = {
        issuer: config.OAUTH_ISSUER,
        authorization_endpoint: new URL(
          "/oauth/authorize",
          config.OAUTH_ISSUER,
        ).toString(),
        token_endpoint: new URL("/oauth/token", config.OAUTH_ISSUER).toString(),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: config.OAUTH_SCOPE.split(" "),
        token_endpoint_auth_methods_supported: [
          "client_secret_post",
          "client_secret_basic",
        ],
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
 * Describes this server as a protected resource using external OAuth provider
 */
export function createProtectedResourceMetadataHandler() {
  return (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const baseUrl = `${req.protocol}://${req.get("host")}`;

      if (!config.ENABLE_AUTH) {
        return res.status(500).json({
          error: "server_error",
          error_description: "Authentication not configured",
        });
      }

      const metadata = {
        resource: baseUrl,
        authorization_servers: [config.OAUTH_ISSUER], // Point to Auth0
        scopes_supported: config.OAUTH_SCOPE.split(" "),
        bearer_methods_supported: ["header"],
        resource_documentation: new URL("/docs", baseUrl).toString(),
      };

      logger.info("OAuth protected resource metadata requested", {
        resource: metadata.resource,
        authorization_servers: metadata.authorization_servers,
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
