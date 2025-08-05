import type { Request, Response } from "express";
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
      // ...existing code...
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
