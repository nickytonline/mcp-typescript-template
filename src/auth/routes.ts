import type { Request, Response } from "express";
import { logger } from "../logger.ts";

/**
 * OAuth authorization endpoint using oauth2-server
 */
export function createAuthorizeHandler(oauthServer: any) {
  return async (req: Request, res: Response) => {
    try {
      const request = new oauthServer.server.Request(req);
      const response = new oauthServer.server.Response(res);

      const code = await oauthServer.server.authorize(request, response);
      
      logger.info("Authorization code generated", { 
        client_id: code.client.id,
        redirect_uri: code.redirectUri,
        code: code.authorizationCode.substring(0, 8) + "..."
      });

      res.redirect(response.headers.location);
      
    } catch (error) {
      logger.error("OAuth authorization error", { 
        error: error instanceof Error ? error.message : error 
      });
      
      if (error.name === 'InvalidClientError') {
        res.status(400).json({
          error: "invalid_client",
          error_description: error.message
        });
      } else if (error.name === 'InvalidRequestError') {
        res.status(400).json({
          error: "invalid_request",
          error_description: error.message
        });
      } else {
        res.status(500).json({
          error: "server_error",
          error_description: "Failed to process authorization request"
        });
      }
    }
  };
}

/**
 * OAuth callback handler - simplified for oauth2-server
 */
export function createCallbackHandler() {
  return async (req: Request, res: Response) => {
    try {
      const { error, error_description } = req.query;
      
      if (error) {
        logger.warn("OAuth callback error from provider", { error, error_description });
        return res.status(400).json({
          error: error as string,
          error_description: error_description as string || "OAuth authorization failed"
        });
      }
      
      logger.info("OAuth callback successful");
      
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