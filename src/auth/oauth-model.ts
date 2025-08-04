import OAuth2Server from '@node-oauth/oauth2-server';
import { randomBytes, createHash } from 'node:crypto';
import { logger } from '../logger.ts';
import { getConfig } from '../config.ts';

type AuthorizationCode = OAuth2Server.AuthorizationCode;
type AuthorizationCodeModel = OAuth2Server.AuthorizationCodeModel;
type Client = OAuth2Server.Client;
type Token = OAuth2Server.Token;
type User = OAuth2Server.User;

// In-memory storage (use persistent storage in production)
// In production, use a proper database
const clients = new Map<string, Client>();
const users = new Map<string, User>();
const authorizationCodes = new Map<string, AuthorizationCode>();
const tokens = new Map<string, Token>();

// Get client configuration from environment
const config = getConfig();
const configuredClient: Client = {
  id: config.OAUTH_CLIENT_ID,
  clientSecret: config.OAUTH_CLIENT_SECRET,
  redirectUris: ['http://localhost:3000/callback', 'vscode://ms-vscode.claude-dev'],
  grants: ['authorization_code']
};

// Initialize client data
clients.set(configuredClient.id, configuredClient);

export const oauthModel: AuthorizationCodeModel = {
  /**
   * Get client by client ID
   */
  async getClient(clientId: string, clientSecret?: string): Promise<Client | false> {
    logger.debug('OAuth model: getClient', { 
      clientId, 
      hasSecret: !!clientSecret,
      providedSecret: clientSecret ? clientSecret.substring(0, 3) + '...' : 'none',
      availableClients: Array.from(clients.keys()),
      clientsMapSize: clients.size,
      clientsMapEntries: Array.from(clients.entries()).map(([k, v]) => ({ id: k, secret: v.clientSecret?.substring(0, 3) + '...' }))
    });
    
    const client = clients.get(clientId);
    if (!client) {
      logger.warn('Client not found', { clientId, availableClients: Array.from(clients.keys()) });
      return false;
    }

    // If client secret is provided, validate it
    if (clientSecret && client.clientSecret !== clientSecret) {
      logger.warn('Client secret mismatch', { 
        clientId,
        expectedSecret: client.clientSecret?.substring(0, 3) + '...',
        providedSecret: clientSecret.substring(0, 3) + '...'
      });
      return false;
    }

    logger.debug('Client found and validated', { clientId });
    return client;
  },

  /**
   * Save authorization code
   */
  async saveAuthorizationCode(code: AuthorizationCode, client: Client, user: User): Promise<AuthorizationCode> {
    logger.debug('OAuth model: saveAuthorizationCode', { 
      code: code.authorizationCode.substring(0, 8) + '...',
      clientId: client.id,
      userId: user.id 
    });

    const authCode = {
      ...code,
      client,
      user
    };
    
    authorizationCodes.set(code.authorizationCode, authCode);
    return authCode;
  },

  /**
   * Get authorization code
   */
  async getAuthorizationCode(authorizationCode: string): Promise<AuthorizationCode | false> {
    logger.debug('OAuth model: getAuthorizationCode', { 
      code: authorizationCode.substring(0, 8) + '...' 
    });

    const code = authorizationCodes.get(authorizationCode);
    if (!code) {
      return false;
    }

    // Check if code has expired
    if (code.expiresAt && code.expiresAt < new Date()) {
      authorizationCodes.delete(authorizationCode);
      return false;
    }

    return code;
  },

  /**
   * Revoke authorization code (called after token exchange)
   */
  async revokeAuthorizationCode(code: AuthorizationCode): Promise<boolean> {
    logger.debug('OAuth model: revokeAuthorizationCode', { 
      code: code.authorizationCode.substring(0, 8) + '...' 
    });

    return authorizationCodes.delete(code.authorizationCode);
  },

  /**
   * Save access token
   */
  async saveToken(token: Token, client: Client, user: User): Promise<Token> {
    logger.debug('OAuth model: saveToken', { 
      accessToken: token.accessToken.substring(0, 8) + '...',
      clientId: client.id,
      userId: user.id 
    });

    const fullToken = {
      ...token,
      client,
      user
    };

    tokens.set(token.accessToken, fullToken);
    if (token.refreshToken) {
      tokens.set(token.refreshToken, fullToken);
    }

    return fullToken;
  },

  /**
   * Get access token
   */
  async getAccessToken(accessToken: string): Promise<Token | false> {
    logger.debug('OAuth model: getAccessToken', { 
      token: accessToken.substring(0, 8) + '...' 
    });

    const token = tokens.get(accessToken);
    if (!token) {
      return false;
    }

    // Check if token has expired
    if (token.accessTokenExpiresAt && token.accessTokenExpiresAt < new Date()) {
      tokens.delete(accessToken);
      return false;
    }

    return token;
  },

  /**
   * Get refresh token
   */
  async getRefreshToken(refreshToken: string): Promise<Token | false> {
    logger.debug('OAuth model: getRefreshToken', { 
      token: refreshToken.substring(0, 8) + '...' 
    });

    const token = tokens.get(refreshToken);
    if (!token) {
      return false;
    }

    // Check if refresh token has expired
    if (token.refreshTokenExpiresAt && token.refreshTokenExpiresAt < new Date()) {
      tokens.delete(refreshToken);
      return false;
    }

    return token;
  },

  /**
   * Revoke token
   */
  async revokeToken(token: Token): Promise<boolean> {
    logger.debug('OAuth model: revokeToken', { 
      accessToken: token.accessToken.substring(0, 8) + '...' 
    });

    let revoked = false;
    
    if (tokens.delete(token.accessToken)) {
      revoked = true;
    }
    
    if (token.refreshToken && tokens.delete(token.refreshToken)) {
      revoked = true;
    }

    return revoked;
  },

  /**
   * Validate scope
   */
  async validateScope(user: User, client: Client, scope: string[]): Promise<string[] | false> {
    logger.debug('OAuth model: validateScope', { 
      userId: user.id,
      clientId: client.id,
      scope 
    });

    // Simplified scope validation - implement proper scope checking
    // In production, implement proper scope validation
    const allowedScopes = ['read', 'write', 'mcp'];
    const validScopes = scope.filter(s => allowedScopes.includes(s));
    
    return validScopes.length > 0 ? validScopes : ['read'];
  },

  /**
   * Verify scope
   */
  async verifyScope(token: Token, scope: string[]): Promise<boolean> {
    logger.debug('OAuth model: verifyScope', { 
      tokenScope: token.scope,
      requestedScope: scope 
    });

    if (!token.scope || !scope) {
      return false;
    }

    const tokenScopes = Array.isArray(token.scope) ? token.scope : [token.scope];
    return scope.every(s => tokenScopes.includes(s));
  }
};

// Removed demo user authentication - use external authentication system

/**
 * Generate secure tokens
 */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Generate authorization code
 */
export function generateAuthorizationCode(): string {
  return randomBytes(16).toString('hex');
}