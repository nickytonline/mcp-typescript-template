import { logger } from "../logger.ts";

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

  constructor(issuer: string, audience?: string) {
    this.#issuer = issuer;
    this.#audience = audience;
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
      const [headerB64, payloadB64] = token.split('.');
      
      const payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf-8')
      );

      const now = Math.floor(Date.now() / 1000);
      
      if (payload.exp && payload.exp < now) {
        return { valid: false, error: "Token expired" };
      }
      
      if (payload.iss !== this.#issuer) {
        return { valid: false, error: "Invalid issuer" };
      }
      
      if (this.#audience) {
        const tokenAud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (!tokenAud.includes(this.#audience)) {
          return { valid: false, error: "Invalid audience" };
        }
      }

      return {
        valid: true,
        userId: payload.sub || payload.user_id || payload.username,
      };

    } catch (error) {
      logger.warn("JWT parsing failed, falling back to introspection", { 
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
 * Built-in token validator for OAuth authorization server mode
 */
export class BuiltinTokenValidator {
  #tokens = new Map<string, { userId: string; expiresAt: Date }>();
  storeToken(token: string, userId: string, expiresAt: Date): void {
    this.#tokens.set(token, { userId, expiresAt });
    
    setTimeout(() => {
      this.#tokens.delete(token);
    }, expiresAt.getTime() - Date.now());
  }

  async validateToken(token: string): Promise<TokenValidationResult> {
    try {
      const tokenData = this.#tokens.get(token);
      
      if (!tokenData) {
        return { valid: false, error: "Token not found" };
      }

      if (tokenData.expiresAt < new Date()) {
        this.#tokens.delete(token);
        return { valid: false, error: "Token expired" };
      }

      return {
        valid: true,
        userId: tokenData.userId,
      };

    } catch (error) {
      logger.error("Built-in token validation error", { 
        error: error instanceof Error ? error.message : error 
      });
      return { valid: false, error: "Token validation failed" };
    }
  }
}