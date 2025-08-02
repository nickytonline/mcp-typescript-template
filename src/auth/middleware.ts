import type { Request, Response, NextFunction } from "express";
import { OAuthTokenValidator, BuiltinTokenValidator } from "./token-validator.ts";
import { logger } from "../logger.ts";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  accessToken?: string;
}

type TokenValidator = OAuthTokenValidator | BuiltinTokenValidator;

/**
 * Create authentication middleware that supports both gateway and built-in modes
 */
export function createAuthMiddleware(tokenValidator: TokenValidator) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "unauthorized",
        error_description: "Missing or invalid authorization header",
      });
    }

    const token = authHeader.substring(7);

    try {
      const validation = await tokenValidator.validateToken(token);

      if (!validation.valid) {
        return res.status(401).json({
          error: "invalid_token",
          error_description: validation.error || "The access token is invalid or expired",
        });
      }

      req.userId = validation.userId;
      req.accessToken = token;

      logger.info("Request authenticated", { userId: validation.userId });
      next();
    } catch (error) {
      logger.error("Authentication middleware error", { 
        error: error instanceof Error ? error.message : error 
      });
      return res.status(500).json({
        error: "server_error",
        error_description: "Internal server error during authentication",
      });
    }
  };
}
