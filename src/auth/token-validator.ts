import { logger } from "../logger.ts";
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from "jose";

export interface TokenValidationResult {
  valid: boolean;
  userId?: string;
  error?: string;
}

/**
 * Gateway token validator - validates JWT tokens from external OAuth providers
 */
export class GatewayTokenValidator {
  #issuer: string;
  #audience?: string;
  #jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(issuer: string, audience?: string) {
    this.#issuer = issuer;
    this.#audience = audience;
    this.#jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const isJWT = token.split('.').length === 3;
      
      if (isJWT) {
        return await this.validateJWT(token);
      } else {
        return await this.introspectToken(token);
      }

    } catch (error) {
      logger.error("Gateway token validation error", { 
        error: error instanceof Error ? error.message : error 
      });
      return { valid: false, error: "Token validation failed" };
    }
  }

  private async validateJWT(token: string): Promise<TokenValidationResult> {
    try {
      const { payload } = await jwtVerify(token, this.#jwks, {
        issuer: this.#issuer,
        audience: this.#audience,
      });

      return {
        valid: true,
        userId: payload.sub || (payload as any).user_id || (payload as any).username,
      };

    } catch (error) {
      logger.warn("JWT verification failed, falling back to introspection", { 
        error: error instanceof Error ? error.message : error 
      });
      return await this.introspectToken(token);
    }
  }

  private async introspectToken(token: string): Promise<TokenValidationResult> {
    const introspectionUrl = `${this.#issuer}/oauth/introspect`;
    
    const response = await fetch(introspectionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token,
        token_type_hint: "access_token",
      }),
    });

    if (!response.ok) {
      logger.warn("Token introspection failed", { 
        status: response.status,
        statusText: response.statusText 
      });
      return { valid: false, error: "Token introspection failed" };
    }

    const result = await response.json();
    
    if (!result.active) {
      return { valid: false, error: "Token is not active" };
    }

    if (this.#audience && result.aud !== this.#audience) {
      return { valid: false, error: "Invalid audience" };
    }

    return {
      valid: true,
      userId: result.sub || result.user_id || result.username,
    };
  }
}

/**
 * Built-in token validator for OAuth authorization server mode using oauth2-server
 */
export class BuiltinTokenValidator {
  #oauthServer: any;

  constructor(oauthServer: any) {
    this.#oauthServer = oauthServer;
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      // Create mock request with Authorization header
      const mockRequest = {
        method: 'GET',
        url: '/',
        headers: {
          authorization: `Bearer ${token}`
        }
      };

      const mockResponse = {
        status: () => mockResponse,
        json: () => mockResponse,
        headers: {}
      };

      const request = new this.#oauthServer.server.Request(mockRequest);
      const response = new this.#oauthServer.server.Response(mockResponse);

      const authenticatedToken = await this.#oauthServer.server.authenticate(request, response);
      
      return {
        valid: true,
        userId: authenticatedToken.user.id,
      };

    } catch (error) {
      logger.warn("Built-in token validation failed", { 
        error: error instanceof Error ? error.message : error 
      });
      return { valid: false, error: "Token validation failed" };
    }
  }
}