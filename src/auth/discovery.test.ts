import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  createAuthorizationServerMetadataHandler,
  createProtectedResourceMetadataHandler,
} from "./discovery.ts";
import { logger } from "../logger.ts";

// Mock logger
vi.mock("../logger.ts", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock config
vi.mock("../config.ts", () => ({
  getConfig: vi.fn().mockReturnValue({
    ENABLE_AUTH: true,
    OAUTH_ISSUER: "https://auth.example.com",
    OAUTH_CLIENT_ID: "test-client-id",
    OAUTH_CLIENT_SECRET: "test-client-secret",
    OAUTH_REDIRECT_URI: "https://auth.example.com/callback",
    OAUTH_SCOPE: "openid profile email",
    BASE_URL: "https://myserver.example.com",
    MCP_CLIENT_ID: "mcp-client",
  }),
}));

describe("OAuth Discovery Endpoints", () => {
  let mockReq: Request;
  let mockRes: Response;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockReq = {
      get: vi.fn().mockReturnValue("myserver.example.com"),
    } as unknown as Request;
    Object.defineProperty(mockReq, "protocol", {
      value: "https",
      writable: true,
      configurable: true,
      enumerable: true,
    });

    mockRes = {
      json: jsonSpy,
      status: statusSpy,
      // @ts-ignore: Only properties used by handler are needed
    } as unknown as Response;

    vi.clearAllMocks();
  });

  describe("createAuthorizationServerMetadataHandler", () => {
    it("should return OAuth authorization server metadata pointing to Auth0", () => {
      const handler = createAuthorizationServerMetadataHandler();
      handler(mockReq, mockRes);

      expect(jsonSpy).toHaveBeenCalledWith({
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/oauth/authorize",
        token_endpoint: "https://auth.example.com/oauth/token",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["openid", "profile", "email"],
        token_endpoint_auth_methods_supported: [
          "client_secret_post",
          "client_secret_basic",
        ],
      });
    });

    it("should log metadata request", () => {
      const handler = createAuthorizationServerMetadataHandler();

      handler(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        "OAuth authorization server metadata requested",
        { issuer: "https://auth.example.com" },
      );
    });

    it.skip("should handle errors gracefully", () => {
      const handler = createAuthorizationServerMetadataHandler();

      // Mock req.get to throw an error when building resource URL
      vi.mocked(mockReq.get).mockImplementation(() => {
        throw new Error("Request error");
      });

      handler(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith(
        "Error serving authorization server metadata",
        { error: "Request error" },
      );

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "server_error",
        error_description: "Failed to serve authorization server metadata",
      });
    });
  });

  describe("createProtectedResourceMetadataHandler", () => {
    it("should return OAuth protected resource metadata", () => {
      const handler = createProtectedResourceMetadataHandler();
      handler(mockReq, mockRes);

      expect(jsonSpy).toHaveBeenCalledWith({
        resource: "https://myserver.example.com",
        authorization_servers: ["https://auth.example.com"],
        scopes_supported: ["openid", "profile", "email"],
        bearer_methods_supported: ["header"],
        resource_documentation: "https://myserver.example.com/docs",
      });
    });

    it("should log metadata request", () => {
      const handler = createProtectedResourceMetadataHandler();

      handler(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        "OAuth protected resource metadata requested",
        {
          resource: "https://myserver.example.com",
          authorization_servers: ["https://auth.example.com"],
        },
      );
    });

    it("should handle errors gracefully", () => {
      const handler = createProtectedResourceMetadataHandler();

      // Mock req.get to throw an error
      vi.mocked(mockReq.get).mockImplementation(() => {
        throw new Error("Resource error");
      });

      handler(mockReq, mockRes);

      expect(logger.error).toHaveBeenCalledWith(
        "Error serving protected resource metadata",
        { error: "Resource error" },
      );

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith({
        error: "server_error",
        error_description: "Failed to serve protected resource metadata",
      });
    });
  });
});
