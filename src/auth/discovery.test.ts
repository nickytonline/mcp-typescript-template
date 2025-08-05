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

describe("OAuth Discovery Endpoints", () => {
  let mockReq: Request;
  let mockRes: Response;
  let jsonSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    jsonSpy = vi.fn();
    statusSpy = vi.fn().mockReturnValue({ json: jsonSpy });

    mockReq = {
      get: vi.fn().mockReturnValue("auth.example.com"),
      // ...other required Request properties can be added here as needed
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
    it("should return OAuth authorization server metadata", () => {
      const handler = createAuthorizationServerMetadataHandler();
      handler(mockReq, mockRes);

      expect(jsonSpy).toHaveBeenCalledWith({
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/oauth/authorize",
        token_endpoint: "https://auth.example.com/oauth/token",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["read", "write", "mcp"],
        token_endpoint_auth_methods_supported: ["none"],
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

    it("should handle errors gracefully", () => {
      const handler = createAuthorizationServerMetadataHandler();

      // Mock req.get to throw an error
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

    it("should construct correct URLs with different protocols", () => {
      Object.defineProperty(mockReq, "protocol", { value: "http" });
      vi.mocked(mockReq.get).mockReturnValue("localhost:3000");

      const handler = createAuthorizationServerMetadataHandler();
      handler(mockReq, mockRes);

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          issuer: "http://localhost:3000",
          authorization_endpoint: "http://localhost:3000/oauth/authorize",
          token_endpoint: "http://localhost:3000/oauth/token",
        }),
      );
    });
  });

  describe("createProtectedResourceMetadataHandler", () => {
    it("should return OAuth protected resource metadata", () => {
      const handler = createProtectedResourceMetadataHandler();
      handler(mockReq, mockRes);

      expect(jsonSpy).toHaveBeenCalledWith({
        resource: "https://auth.example.com",
        authorization_servers: ["https://auth.example.com"],
        scopes_supported: ["read", "write", "mcp"],
        bearer_methods_supported: ["header"],
        resource_documentation: "https://auth.example.com/docs",
      });
    });

    it("should log metadata request", () => {
      const handler = createProtectedResourceMetadataHandler();

      handler(mockReq, mockRes);

      expect(logger.info).toHaveBeenCalledWith(
        "OAuth protected resource metadata requested",
        { resource: "https://auth.example.com" },
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

    it("should construct correct URLs with different hosts", () => {
      Object.defineProperty(mockReq, "protocol", { value: "http" });
      vi.mocked(mockReq.get).mockReturnValue("api.myservice.com");

      const handler = createProtectedResourceMetadataHandler();
      handler(mockReq, mockRes);

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          resource: "http://api.myservice.com",
          authorization_servers: ["http://api.myservice.com"],
          resource_documentation: "http://api.myservice.com/docs",
        }),
      );
    });
  });
});
