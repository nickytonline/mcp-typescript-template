import type { Request, Response } from "express";
import { randomBytes, createHash } from "node:crypto";
import { logger } from "../logger.ts";
import { getConfig } from "../config.ts";
import type { OAuthProvider } from "./oauth-provider.ts";

interface TokenExchangeResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  id_token?: string;
  refresh_token?: string;
}

interface PendingAuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
  // Our own PKCE parameters for external IdP
  externalCodeVerifier: string;
  externalCodeChallenge: string;
}

// Store pending authorization requests (use database in production)
const pendingRequests = new Map<string, PendingAuthRequest>();

/**
 * OAuth authorization endpoint - proxies to external OAuth provider (e.g., Auth0)
 * This implements the MCP-compliant OAuth proxy pattern
 */
export function createAuthorizeHandler() {
  return async (req: Request, res: Response) => {
    try {
      logger.debug("Authorization handler called", {
        query: req.query,
        url: req.url,
      });

      const config = getConfig();

      // Auth routes are only registered when ENABLE_AUTH is true
      if (!config.ENABLE_AUTH) {
        return res.status(500).json({
          error: "server_error",
          error_description: "Authentication not configured",
        });
      }

      const {
        response_type,
        client_id,
        redirect_uri,
        scope,
        state,
        code_challenge,
        code_challenge_method,
      } = req.query;

      // Validate required OAuth 2.1 parameters
      if (response_type !== "code") {
        return res.status(400).json({
          error: "unsupported_response_type",
          error_description: "Only 'code' response type is supported",
        });
      }

      if (!client_id || !redirect_uri) {
        return res.status(400).json({
          error: "invalid_request",
          error_description:
            "Missing required parameters: client_id, redirect_uri",
        });
      }

      // PKCE is required for OAuth 2.1
      if (!code_challenge || code_challenge_method !== "S256") {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "PKCE with S256 is required",
        });
      }

      // Generate a unique request ID to track this authorization request
      const requestId = randomBytes(16).toString("hex");
      const finalState = (state as string) || randomBytes(16).toString("hex");

      // Generate our own PKCE parameters for external IdP
      const externalCodeVerifier = randomBytes(32).toString("base64url");
      const externalCodeChallenge = createHash("sha256")
        .update(externalCodeVerifier)
        .digest("base64url");

      // Store the original request parameters plus our PKCE data
      pendingRequests.set(requestId, {
        clientId: client_id as string,
        redirectUri: redirect_uri as string,
        scope: (scope as string) || "openid profile email",
        state: finalState,
        codeChallenge: code_challenge as string,
        codeChallengeMethod: code_challenge_method as string,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        externalCodeVerifier,
        externalCodeChallenge,
      });

      // Build authorization URL for external provider with our own PKCE
      const authUrl = new URL("/oauth/authorize", config.OAUTH_ISSUER);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", config.OAUTH_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", config.OAUTH_REDIRECT_URI);
      authUrl.searchParams.set(
        "scope",
        (scope as string) || "openid profile email",
      );
      authUrl.searchParams.set("state", requestId);
      authUrl.searchParams.set("code_challenge", externalCodeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      logger.info("Proxying OAuth authorization request", {
        client_id,
        redirect_uri,
        scope,
        requestId,
        external_auth_url: new URL(
          "/oauth/authorize",
          config.OAUTH_ISSUER,
        ).toString(),
      });

      // Redirect to external OAuth provider
      res.redirect(authUrl.toString());
    } catch (error) {
      logger.error("OAuth authorization proxy error", {
        error: error instanceof Error ? error.message : error,
      });

      res.status(500).json({
        error: "server_error",
        error_description: "Failed to process authorization request",
      });
    }
  };
}

/**
 * OAuth callback handler - receives callback from external OAuth provider
 * This completes the OAuth proxy flow by exchanging the code for tokens
 */
export function createCallbackHandler(oauthProvider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    try {
      logger.debug("OAuth callback handler called", {
        query: req.query,
        url: req.url,
      });

      const { code, state, error, error_description } = req.query;

      if (error) {
        logger.warn("OAuth callback error from external provider", {
          error,
          error_description,
        });
        return res.status(400).json({
          error: error as string,
          error_description:
            (error_description as string) || "OAuth authorization failed",
        });
      }

      if (!code || !state) {
        logger.warn("OAuth callback missing required parameters", {
          code: !!code,
          state: !!state,
        });
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing authorization code or state",
        });
      }

      // Retrieve the original request using state as requestId
      const requestId = state as string;
      const originalRequest = pendingRequests.get(requestId);

      logger.debug("OAuth callback debug info", {
        receivedState: requestId,
        storedRequestIds: Array.from(pendingRequests.keys()),
        requestFound: !!originalRequest,
      });

      if (!originalRequest) {
        logger.warn("OAuth callback with unknown or expired state", {
          requestId,
          availableRequestIds: Array.from(pendingRequests.keys()),
        });
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Unknown or expired authorization request",
        });
      }

      // Check if request has expired
      if (originalRequest.expiresAt < new Date()) {
        pendingRequests.delete(requestId);
        logger.warn("OAuth callback with expired request", { requestId });
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Authorization request has expired",
        });
      }

      logger.info("OAuth callback received from external provider", {
        code: typeof code === "string" ? code.substring(0, 8) + "..." : code,
        requestId,
        clientId: originalRequest.clientId,
      });

      // Exchange authorization code for tokens with external provider
      const config = getConfig();
      const tokenResponse = await exchangeCodeForTokens(
        code as string,
        config,
        originalRequest.externalCodeVerifier,
      );

      if (!tokenResponse) {
        pendingRequests.delete(requestId);
        return res.status(500).json({
          error: "server_error",
          error_description: "Failed to exchange authorization code for tokens",
        });
      }

      // Generate our own authorization code for the MCP client
      const mcpAuthCode = randomBytes(32).toString("hex");

      // Store the authorization code with external token data
      oauthProvider.storeAuthorizationCodeWithTokens(
        mcpAuthCode,
        {
          clientId: originalRequest.clientId,
          redirectUri: originalRequest.redirectUri,
          scope: originalRequest.scope,
          codeChallenge: originalRequest.codeChallenge,
          codeChallengeMethod: originalRequest.codeChallengeMethod,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        },
        {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          idToken: tokenResponse.id_token,
          expiresIn: tokenResponse.expires_in,
          scope: tokenResponse.scope,
        },
        `external-user-${randomBytes(8).toString("hex")}`, // Generate unique user ID
      );

      logger.info("Token exchange completed, MCP auth code generated", {
        requestId,
        clientId: originalRequest.clientId,
        externalTokenExpiry: tokenResponse.expires_in,
        mcpAuthCode: mcpAuthCode.substring(0, 8) + "...",
      });

      // Clean up pending request
      pendingRequests.delete(requestId);

      // Redirect back to the original MCP client with our authorization code
      const redirectParams = new URLSearchParams({
        code: mcpAuthCode,
        state: originalRequest.state,
      });

      const redirectUrl = `${originalRequest.redirectUri}?${redirectParams}`;

      logger.info("Redirecting to MCP client with authorization code", {
        clientId: originalRequest.clientId,
        redirectUri: originalRequest.redirectUri,
      });

      res.redirect(redirectUrl);
    } catch (error) {
      logger.error("OAuth callback error", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to complete OAuth authorization",
      });
    }
  };
}

/**
 * Exchange authorization code for tokens with external OAuth provider
 */
async function exchangeCodeForTokens(
  code: string,
  config: any,
  codeVerifier: string,
): Promise<TokenExchangeResponse | null> {
  try {
    // This function is only called from handlers that verify ENABLE_AUTH
    if (!config.ENABLE_AUTH) {
      throw new Error("Authentication not configured");
    }

    const tokenEndpoint = new URL("/oauth/token", config.OAUTH_ISSUER);

    const tokenParams = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.OAUTH_CLIENT_ID,
      client_secret: config.OAUTH_CLIENT_SECRET,
      code,
      redirect_uri: config.OAUTH_REDIRECT_URI,
      code_verifier: codeVerifier,
    });

    logger.info("Exchanging authorization code with external provider", {
      tokenEndpoint: tokenEndpoint.toString(),
      clientId: config.OAUTH_CLIENT_ID,
    });

    const response = await fetch(tokenEndpoint.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: tokenParams,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error("Token exchange failed", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        tokenEndpoint: tokenEndpoint.toString(),
        clientId: config.OAUTH_CLIENT_ID,
      });
      return null;
    }

    const tokenData = (await response.json()) as TokenExchangeResponse;

    logger.info("Token exchange successful", {
      tokenType: tokenData.token_type,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
      hasIdToken: !!tokenData.id_token,
      hasRefreshToken: !!tokenData.refresh_token,
    });

    return tokenData;
  } catch (error) {
    logger.error("Token exchange error", {
      error: error instanceof Error ? error.message : error,
    });
    return null;
  }
}

/**
 * OAuth token endpoint - issues tokens for MCP clients after external auth
 */
export function createTokenHandler(oauthProvider: OAuthProvider) {
  return async (req: Request, res: Response) => {
    try {
      const { grant_type, code, code_verifier, client_id, redirect_uri } =
        req.body;

      if (grant_type !== "authorization_code") {
        return res.status(400).json({
          error: "unsupported_grant_type",
          error_description: "Only authorization_code grant type is supported",
        });
      }

      if (!code || !code_verifier || !client_id || !redirect_uri) {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "Missing required parameters",
        });
      }

      // Exchange the authorization code for an access token
      const tokenResult = await oauthProvider.exchangeAuthorizationCode(
        code,
        code_verifier,
        client_id,
        redirect_uri,
      );

      if (!tokenResult) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid authorization code or code verifier",
        });
      }

      logger.info("MCP access token issued", {
        clientId: client_id,
        scope: tokenResult.scope,
      });

      res.json({
        access_token: tokenResult.accessToken,
        token_type: "Bearer",
        expires_in: tokenResult.expiresIn,
        scope: tokenResult.scope,
      });
    } catch (error) {
      logger.error("Token endpoint error", {
        error: error instanceof Error ? error.message : error,
      });
      res.status(500).json({
        error: "server_error",
        error_description: "Failed to issue access token",
      });
    }
  };
}
