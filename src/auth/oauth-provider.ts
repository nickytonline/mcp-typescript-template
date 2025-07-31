import { z } from "zod";
import { logger } from "../logger.js";

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scope: string;
  redirectUri: string;
}

export interface AccessToken {
  token: string;
  expiresAt: Date;
  userId?: string;
}

export class OAuthProvider {
  constructor(private config: OAuthConfig) {}

  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      state,
    });

    return `${this.config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<AccessToken> {
    try {
      const response = await fetch(this.config.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${this.config.clientId}:${this.config.clientSecret}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: this.config.redirectUri,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token exchange failed: ${response.statusText}`);
      }

      const tokenData = await response.json();
      
      return {
        token: tokenData.access_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        userId: tokenData.sub,
      };
    } catch (error) {
      logger.error("OAuth token exchange failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Validate access token
   */
  async validateToken(token: string): Promise<{ valid: boolean; userId?: string }> {
    try {
      // In a real implementation, you would validate against your OAuth provider
      // This is a simplified example
      const response = await fetch(`${this.config.tokenEndpoint}/introspect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${this.config.clientId}:${this.config.clientSecret}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          token,
        }),
      });

      if (!response.ok) {
        return { valid: false };
      }

      const introspection = await response.json();
      return {
        valid: introspection.active === true,
        userId: introspection.sub,
      };
    } catch (error) {
      logger.error("Token validation failed", { error: error.message });
      return { valid: false };
    }
  }
}