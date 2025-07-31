import { Request, Response, NextFunction } from "express";
import { OAuthProvider } from "./oauth-provider.js";
import { logger } from "../logger.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  accessToken?: string;
}

/**
 * Create OAuth middleware that can be easily added/removed
 */
export function createOAuthMiddleware(oauthProvider: OAuthProvider) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "unauthorized",
        error_description: "Missing or invalid authorization header",
      });
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    
    try {
      const validation = await oauthProvider.validateToken(token);
      
      if (!validation.valid) {
        return res.status(401).json({
          error: "invalid_token",
          error_description: "The access token is invalid or expired",
        });
      }

      // Add user context to request
      req.userId = validation.userId;
      req.accessToken = token;
      
      logger.info("Request authenticated", { userId: validation.userId });
      next();
    } catch (error) {
      logger.error("Authentication middleware error", { error: error.message });
      return res.status(500).json({
        error: "server_error",
        error_description: "Internal server error during authentication",
      });
    }
  };
}

/**
 * Optional middleware that only authenticates if token is present
 */
export function createOptionalOAuthMiddleware(oauthProvider: OAuthProvider) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No auth header, continue without authentication
      return next();
    }

    const token = authHeader.substring(7);
    
    try {
      const validation = await oauthProvider.validateToken(token);
      
      if (validation.valid) {
        req.userId = validation.userId;
        req.accessToken = token;
        logger.info("Request authenticated", { userId: validation.userId });
      }
      
      next();
    } catch (error) {
      logger.warn("Optional authentication failed", { error: error.message });
      next(); // Continue without authentication
    }
  };
}