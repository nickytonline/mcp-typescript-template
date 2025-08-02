import type { Request, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import { logger } from "../logger.ts";
import { getConfig } from "../config.ts";
import type { OAuthProvider } from "./oauth-provider.ts";

/**
 * OAuth authorization endpoint - proxies to external OAuth provider (e.g., Auth0)
 * This implements the MCP-compliant OAuth proxy pattern
 */
export function createAuthorizeHandler(oauthProvider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    try {
      const config = getConfig();
      const { 
        response_type, 
        client_id, 
        redirect_uri, 
        scope, 
        state, 
        code_challenge, 
        code_challenge_method 
      } = req.query;

      // Validate required OAuth 2.1 parameters
      if (response_type !== "code") {
        return res.status(400).json({
          error: "unsupported_response_type",
          error_description: "Only 'code' response type is supported"
        });
      }

      if (!client_id || !redirect_uri) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters: client_id, redirect_uri"
        });
      }

      // PKCE is required for OAuth 2.1
      if (!code_challenge || code_challenge_method !== "S256") {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "PKCE with S256 is required"
        });
      }

      // Build authorization URL for external provider
      const authParams = new URLSearchParams({
        response_type: "code",
        client_id: config.OAUTH_CLIENT_ID!,
        redirect_uri: `${config.BASE_URL || "http://localhost:3000"}/oauth/callback`,
        scope: scope as string || "openid profile email",
        state: state as string || randomBytes(16).toString("hex"),
        code_challenge: code_challenge as string,
        code_challenge_method: "S256"
      });

      const authUrl = `${config.OAUTH_ISSUER}/oauth/authorize?${authParams}`;
      
      logger.info("Proxying OAuth authorization request", { 
        client_id,
        redirect_uri,
        scope,
        external_auth_url: `${config.OAUTH_ISSUER}/oauth/authorize`
      });

      // Redirect to external OAuth provider
      res.redirect(authUrl);
      
    } catch (error) {
      logger.error("OAuth authorization proxy error", { 
        error: error instanceof Error ? error.message : error 
      });
      
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to process authorization request"
      });
    }
  };
}

/**
 * OAuth callback handler - receives callback from external OAuth provider
 * This completes the OAuth proxy flow
 */
export function createCallbackHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;
      
      if (error) {
        logger.warn("OAuth callback error from external provider", { error, error_description });
        return res.status(400).json({
          error: error as string,
          error_description: error_description as string || "OAuth authorization failed"
        });
      }

      if (!code) {
        logger.warn("OAuth callback missing authorization code");
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing authorization code"
        });
      }
      
      logger.info("OAuth callback received from external provider", { 
        code: typeof code === 'string' ? code.substring(0, 8) + "..." : code,
        state 
      });
      
      // In a full implementation, you would:
      // 1. Exchange the code for tokens with the external provider
      // 2. Store the tokens securely
      // 3. Generate your own short-lived tokens for the MCP client
      
      const closeScript = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorization Complete</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              text-align: center; 
              padding: 50px; 
              background: #f5f5f5; 
            }
            .success { 
              color: #28a745; 
              font-size: 24px; 
              margin-bottom: 20px; 
            }
            .message { 
              color: #666; 
              font-size: 16px; 
            }
          </style>
        </head>
        <body>
          <div class="success">✓ Authorization Successful</div>
          <div class="message">You can close this window and return to your application.</div>
          <script>
            // Try to close the window (works if opened as popup)
            if (window.opener) {
              window.close();
            } else {
              // If not a popup, show success message
              setTimeout(() => {
                document.body.innerHTML = '<div class="success">✓ Authorization Complete</div><div class="message">Please return to your application.</div>';
              }, 2000);
            }
          </script>
        </body>
        </html>
      `;
      
      res.send(closeScript);
      
    } catch (error) {
      logger.error("OAuth callback error", { 
        error: error instanceof Error ? error.message : error 
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to complete OAuth authorization"
      });
    }
  };
}