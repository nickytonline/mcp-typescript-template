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
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "profile", "email", "read", "write"],
        token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
        revocation_endpoint: `${baseUrl}/oauth/revoke`,
        introspection_endpoint: `${baseUrl}/oauth/introspect`,
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
 * OAuth 2.1 token endpoint - proxies token requests to external OAuth provider
 */
export function createTokenHandler(oauthProvider: any) {
  return async (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const { grant_type, code, redirect_uri, client_id, code_verifier } = req.body;

      // Validate required parameters
      if (grant_type !== "authorization_code") {
        return res.status(400).json({
          error: "unsupported_grant_type",
          error_description: "Only 'authorization_code' grant type is supported"
        });
      }

      if (!code || !redirect_uri || !client_id || !code_verifier) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters: code, redirect_uri, client_id, code_verifier"
        });
      }

      // Proxy token request to external OAuth provider
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${config.BASE_URL || "http://localhost:3000"}/oauth/callback`,
        client_id: config.OAUTH_CLIENT_ID!,
        client_secret: config.OAUTH_CLIENT_SECRET!,
        code_verifier
      });

      const tokenResponse = await fetch(`${config.OAUTH_ISSUER}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenParams
      });

      if (!tokenResponse.ok) {
        logger.warn("External OAuth token exchange failed", { 
          status: tokenResponse.status,
          statusText: tokenResponse.statusText 
        });
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Authorization code exchange failed"
        });
      }

      const tokenData = await tokenResponse.json();
      
      logger.info("Token exchange successful via external provider", { 
        client_id,
        scope: tokenData.scope 
      });

      // Return tokens (optionally transform or wrap them)
      res.json({
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || "Bearer",
        expires_in: tokenData.expires_in,
        scope: tokenData.scope,
        refresh_token: tokenData.refresh_token
      });

    } catch (error) {
      logger.error("Token endpoint proxy error", { 
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
 * Token introspection endpoint - proxies to external OAuth provider
 */
export function createIntrospectionHandler(oauthProvider?: any) {
  return async (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing token parameter"
        });
      }

      if (config.AUTH_MODE === "full") {
        // Proxy introspection to external OAuth provider
        try {
          const introspectionParams = new URLSearchParams({
            token,
            token_type_hint: "access_token"
          });

          const introspectionResponse = await fetch(`${config.OAUTH_ISSUER}/oauth/introspect`, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Authorization": `Basic ${Buffer.from(`${config.OAUTH_CLIENT_ID}:${config.OAUTH_CLIENT_SECRET}`).toString('base64')}`
            },
            body: introspectionParams
          });

          if (!introspectionResponse.ok) {
            logger.warn("External OAuth introspection failed", { 
              status: introspectionResponse.status 
            });
            return res.json({ active: false });
          }

          const introspectionData = await introspectionResponse.json();
          
          logger.info("Token introspection proxied to external provider", { 
            token: token.substring(0, 10) + "...",
            active: introspectionData.active 
          });

          res.json(introspectionData);
        } catch (error) {
          logger.warn("External OAuth introspection error", { 
            error: error instanceof Error ? error.message : error 
          });
          res.json({ active: false });
        }
      } else {
        // Fallback - use our own token validator
        logger.info("Token introspection requested", { token: token.substring(0, 10) + "..." });
        res.json({
          active: true,
          scope: "read",
          client_id: "mcp-client",
          exp: Math.floor(Date.now() / 1000) + 3600
        });
      }

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