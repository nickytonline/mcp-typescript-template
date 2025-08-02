import type { Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { OAuthProvider } from "./oauth-provider.ts";
import { logger } from "../logger.ts";

/**
 * OAuth authorization endpoint - generates authorization codes with PKCE
 */
export function createAuthorizeHandler(oauthProvider: OAuthProvider) {
  return (req: Request, res: Response) => {
    try {
      const { 
        response_type, 
        client_id, 
        redirect_uri, 
        scope, 
        state, 
        code_challenge, 
        code_challenge_method 
      } = req.query;
      
      if (response_type !== "code") {
        return res.status(400).json({
          error: "unsupported_response_type",
          error_description: "Only authorization code flow is supported"
        });
      }

      if (!client_id || !redirect_uri) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters: client_id, redirect_uri"
        });
      }

      if (!code_challenge || code_challenge_method !== "S256") {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "PKCE is required (code_challenge with S256 method)"
        });
      }
      const authCode = randomBytes(32).toString("hex");
      const oauthState = (state as string) || randomBytes(32).toString("hex");
      oauthProvider.storeAuthorizationCode(authCode, {
        clientId: client_id as string,
        redirectUri: redirect_uri as string,
        scope: scope as string || "read",
        codeChallenge: code_challenge as string,
        codeChallengeMethod: code_challenge_method as string,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });
      
      const redirectUrl = new URL(redirect_uri as string);
      redirectUrl.searchParams.set("code", authCode);
      redirectUrl.searchParams.set("state", oauthState);
      
      logger.info("Authorization code generated", { 
        client_id, 
        redirect_uri, 
        code: authCode.substring(0, 8) + "..."
      });
      
      res.redirect(redirectUrl.toString());
      
    } catch (error) {
      logger.error("OAuth authorization error", { 
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
 * OAuth callback handler - completes OAuth flow
 */
export function createCallbackHandler(oauthProvider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    try {
      const { code, state, error, error_description } = req.query;
      
      if (error) {
        logger.warn("OAuth callback error from provider", { error, error_description });
        return res.status(400).json({
          error: error as string,
          error_description: error_description as string || "OAuth authorization failed"
        });
      }
      
      // Validate required parameters
      if (!code) {
        logger.warn("Missing authorization code in callback");
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing authorization code"
        });
      }
      
      // Exchange authorization code for access token
      const tokenResult = await oauthProvider.exchangeCodeForToken(code as string);
      
      logger.info("OAuth callback successful", { 
        userId: tokenResult.userId,
        state 
      });
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