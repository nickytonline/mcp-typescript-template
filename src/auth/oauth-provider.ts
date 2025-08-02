import { randomBytes, createHash } from "node:crypto";
import { logger } from "../logger.ts";
import { OAuthTokenValidator } from "./token-validator.ts";

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

interface AuthorizationCodeData {
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  expiresAt: Date;
}

/**
 * OAuth authorization server for built-in auth mode
 * Acts as a full OAuth 2.1 authorization server with PKCE support
 */
export class OAuthProvider {
  #config: OAuthConfig;
  #tokenValidator: OAuthTokenValidator;
  
  // In-memory stores (use database in production)
  #authorizationCodes = new Map<string, AuthorizationCodeData>();
  #accessTokens = new Map<string, { userId: string; scope: string; expiresAt: Date }>();

  constructor(config: OAuthConfig) {
    this.#config = config;
    
    // For built-in mode, we ARE the issuer
    const issuer = "http://localhost:3000"; // This should be dynamic based on server config
    this.#tokenValidator = new OAuthTokenValidator(issuer);
    
    // Clean up expired codes and tokens periodically
    setInterval(() => this.cleanup(), 60 * 1000); // Every minute
  }

  get tokenValidator() {
    return this.#tokenValidator;
  }

  /**
   * Store authorization code with PKCE data
   */
  storeAuthorizationCode(code: string, data: AuthorizationCodeData): void {
    this.#authorizationCodes.set(code, data);
  }

  /**
   * Exchange authorization code for access token with PKCE verification
   */
  async exchangeAuthorizationCode(
    code: string, 
    codeVerifier: string, 
    clientId: string, 
    redirectUri: string
  ): Promise<{ accessToken: string; expiresIn: number; scope: string } | null> {
    
    const codeData = this.#authorizationCodes.get(code);
    if (!codeData) {
      logger.warn("Invalid authorization code", { code: code.substring(0, 8) + "..." });
      return null;
    }

    // Check expiration
    if (codeData.expiresAt < new Date()) {
      this.#authorizationCodes.delete(code);
      logger.warn("Expired authorization code", { code: code.substring(0, 8) + "..." });
      return null;
    }

    // Validate client_id and redirect_uri
    if (codeData.clientId !== clientId || codeData.redirectUri !== redirectUri) {
      logger.warn("Authorization code validation failed", { 
        expectedClientId: codeData.clientId,
        providedClientId: clientId,
        expectedRedirectUri: codeData.redirectUri,
        providedRedirectUri: redirectUri
      });
      return null;
    }

    // PKCE verification
    if (!this.verifyPKCE(codeVerifier, codeData.codeChallenge)) {
      logger.warn("PKCE verification failed", { code: code.substring(0, 8) + "..." });
      return null;
    }

    // Generate access token
    const accessToken = `mcp_${randomBytes(32).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const expiresIn = 3600;

    // Store access token
    this.#accessTokens.set(accessToken, {
      userId: "demo-user", // In real implementation, this would be the authenticated user
      scope: codeData.scope,
      expiresAt
    });

    // Clean up authorization code (single use)
    this.#authorizationCodes.delete(code);

    logger.info("Access token issued", { 
      clientId, 
      scope: codeData.scope,
      expiresIn 
    });

    return {
      accessToken,
      expiresIn,
      scope: codeData.scope
    };
  }

  /**
   * Verify PKCE code verifier against challenge
   */
  private verifyPKCE(codeVerifier: string, codeChallenge: string): boolean {
    const hash = createHash('sha256').update(codeVerifier).digest();
    const computedChallenge = hash.toString('base64url');
    return computedChallenge === codeChallenge;
  }

  /**
   * Validate access token
   */
  async validateToken(token: string): Promise<{ valid: boolean; userId?: string; scope?: string }> {
    const tokenData = this.#accessTokens.get(token);
    
    if (!tokenData) {
      return { valid: false };
    }

    if (tokenData.expiresAt < new Date()) {
      this.#accessTokens.delete(token);
      return { valid: false };
    }

    return {
      valid: true,
      userId: tokenData.userId,
      scope: tokenData.scope
    };
  }

  /**
   * Clean up expired codes and tokens
   */
  private cleanup(): void {
    const now = new Date();
    
    // Clean up expired authorization codes
    for (const [code, data] of this.#authorizationCodes.entries()) {
      if (data.expiresAt < now) {
        this.#authorizationCodes.delete(code);
      }
    }
    
    // Clean up expired access tokens
    for (const [token, data] of this.#accessTokens.entries()) {
      if (data.expiresAt < now) {
        this.#accessTokens.delete(token);
      }
    }
  }

}
