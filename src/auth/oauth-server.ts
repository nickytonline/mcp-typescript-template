import OAuth2Server from "oauth2-server";
import { generateChallenge, verifyChallenge } from "pkce-challenge";
import { randomBytes } from "node:crypto";
import { logger } from "../logger.ts";

interface Client {
  id: string;
  grants: string[];
  redirectUris: string[];
}

interface AuthorizationCode {
  authorizationCode: string;
  expiresAt: Date;
  redirectUri: string;
  scope?: string;
  client: Client;
  user: { id: string };
  codeChallenge?: string;
  codeChallengeMethod?: string;
}

interface AccessToken {
  accessToken: string;
  accessTokenExpiresAt: Date;
  scope?: string;
  client: Client;
  user: { id: string };
}

/**
 * OAuth 2.1 server implementation using oauth2-server package
 */
export class ManagedOAuthServer {
  #server: OAuth2Server;
  #authorizationCodes = new Map<string, AuthorizationCode>();
  #accessTokens = new Map<string, AccessToken>();
  #clients = new Map<string, Client>();

  constructor() {
    // Register default MCP client
    this.#clients.set("mcp-client", {
      id: "mcp-client",
      grants: ["authorization_code"],
      redirectUris: ["http://localhost:3000/callback"],
    });

    this.#server = new OAuth2Server({
      model: {
        // Client methods
        getClient: async (clientId: string) => {
          const client = this.#clients.get(clientId);
          return client || null;
        },

        // Authorization code methods
        saveAuthorizationCode: async (code, client, user) => {
          const authCode: AuthorizationCode = {
            authorizationCode: code.authorizationCode,
            expiresAt: code.expiresAt,
            redirectUri: code.redirectUri,
            scope: code.scope,
            client: client as Client,
            user: user as { id: string },
            codeChallenge: (code as any).codeChallenge,
            codeChallengeMethod: (code as any).codeChallengeMethod,
          };
          
          this.#authorizationCodes.set(code.authorizationCode, authCode);
          logger.info("Authorization code saved", { 
            clientId: client.id,
            userId: user.id 
          });
          
          return authCode;
        },

        getAuthorizationCode: async (authorizationCode: string) => {
          const code = this.#authorizationCodes.get(authorizationCode);
          if (!code) return null;

          // Check expiration
          if (code.expiresAt < new Date()) {
            this.#authorizationCodes.delete(authorizationCode);
            return null;
          }

          return code;
        },

        revokeAuthorizationCode: async (code) => {
          this.#authorizationCodes.delete(code.authorizationCode);
          return true;
        },

        // PKCE verification
        verifyCodeChallenge: async (authorizationCode, codeVerifier) => {
          const code = this.#authorizationCodes.get(authorizationCode.authorizationCode);
          if (!code || !code.codeChallenge) return false;

          try {
            return verifyChallenge(codeVerifier, code.codeChallenge);
          } catch (error) {
            logger.warn("PKCE verification failed", { 
              error: error instanceof Error ? error.message : error 
            });
            return false;
          }
        },

        // Access token methods
        saveToken: async (token, client, user) => {
          const accessToken: AccessToken = {
            accessToken: token.accessToken,
            accessTokenExpiresAt: token.accessTokenExpiresAt,
            scope: token.scope,
            client: client as Client,
            user: user as { id: string },
          };

          this.#accessTokens.set(token.accessToken, accessToken);
          logger.info("Access token saved", { 
            clientId: client.id,
            userId: user.id 
          });

          return accessToken;
        },

        getAccessToken: async (accessToken: string) => {
          const token = this.#accessTokens.get(accessToken);
          if (!token) return null;

          // Check expiration
          if (token.accessTokenExpiresAt < new Date()) {
            this.#accessTokens.delete(accessToken);
            return null;
          }

          return token;
        },

        // User verification - should be replaced with real authentication
        getUser: async () => {
          // Generate a unique user ID for each session
          const userId = `user-${randomBytes(8).toString('hex')}`;
          return { id: userId };
        },

        // Scope verification
        verifyScope: async (user, client, scope) => {
          return scope === "read" || scope === "write";
        },

        // PKCE support
        validateScope: async (user, client, scope) => {
          return scope === "read" || scope === "write";
        },
      },
      
      // OAuth 2.1 configuration
      requireClientAuthentication: { authorization_code: true },
      allowBearerTokensInQueryString: false,
      accessTokenLifetime: 3600, // 1 hour
      authorizationCodeLifetime: 600, // 10 minutes
    });
  }

  /**
   * Get the oauth2-server instance
   */
  get server(): OAuth2Server {
    return this.#server;
  }

  /**
   * Register a new client
   */
  registerClient(clientId: string, redirectUris: string[]): void {
    this.#clients.set(clientId, {
      id: clientId,
      grants: ["authorization_code"],
      redirectUris,
    });
    
    logger.info("OAuth client registered", { clientId, redirectUris });
  }

  /**
   * Validate PKCE challenge using pkce-challenge package
   */
  validateCodeChallenge(codeVerifier: string, codeChallenge: string): boolean {
    try {
      return verifyChallenge(codeVerifier, codeChallenge);
    } catch (error) {
      logger.warn("PKCE validation failed", { 
        error: error instanceof Error ? error.message : error 
      });
      return false;
    }
  }
}