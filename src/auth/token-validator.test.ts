import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as jose from "jose";
import {
  OAuthTokenValidator,
  BuiltinTokenValidator,
} from "./token-validator.ts";

vi.mock("../logger.ts", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(),
  jwtVerify: vi.fn(),
  errors: {
    JWTExpired: class JWTExpired extends Error {},
    JWTInvalid: class JWTInvalid extends Error {},
    JWKSNoMatchingKey: class JWKSNoMatchingKey extends Error {},
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("OAuthTokenValidator", () => {
  let validator: OAuthTokenValidator;
  const issuer = "https://auth.example.com";
  const audience = "test-audience";

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new OAuthTokenValidator(issuer, audience);
  });

  describe("validateToken", () => {
    it("should validate JWT tokens", async () => {
      const jwtToken =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      const mockJWKS = {};
      const mockPayload = { sub: "user123", iat: 1516239022 };

      vi.mocked(jose.createRemoteJWKSet).mockReturnValue(mockJWKS as any);
      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: mockPayload,
        protectedHeader: {},
      } as any);

      const result = await validator.validateToken(jwtToken);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("user123");
      expect(jose.createRemoteJWKSet).toHaveBeenCalledWith(
        new URL(`${issuer}/.well-known/jwks.json`),
      );
      expect(jose.jwtVerify).toHaveBeenCalledWith(jwtToken, mockJWKS, {
        issuer,
        audience,
      });
    });

    it("should validate opaque tokens via introspection", async () => {
      const opaqueToken = "opaque-token-123";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: true,
          sub: "user456",
          aud: audience,
        }),
      });

      const result = await validator.validateToken(opaqueToken);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("user456");
      expect(mockFetch).toHaveBeenCalledWith(`${issuer}/oauth/introspect`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: opaqueToken,
          token_type_hint: "access_token",
        }),
      });
    });

    it("should handle general validation errors", async () => {
      const token = "invalid.token.format";

      vi.mocked(jose.jwtVerify).mockRejectedValue(new Error("Network error"));
      mockFetch.mockRejectedValue(new Error("Network error"));

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token validation failed");
    });
  });

  describe("validateJWT", () => {
    it("should extract userId from sub claim", async () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: { sub: "user123" },
        protectedHeader: {},
      } as any);

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("user123");
    });

    it("should extract userId from user_id claim when sub is missing", async () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: { user_id: "user456" },
        protectedHeader: {},
      } as any);

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("user456");
    });

    it("should extract userId from username claim as fallback", async () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: { username: "johndoe" },
        protectedHeader: {},
      } as any);

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("johndoe");
    });

    it("should handle expired JWT tokens", async () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new jose.errors.JWTExpired("JWT expired"),
      );

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token expired");
    });

    it("should handle invalid JWT tokens", async () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.invalid-signature";

      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new jose.errors.JWTInvalid("JWT invalid"),
      );

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid token");
    });

    it("should handle missing JWKS key", async () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new jose.errors.JWKSNoMatchingKey("No matching key"),
      );

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("No matching key found");
    });

    it("should fallback to introspection on JWT validation failure", async () => {
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      vi.mocked(jose.jwtVerify).mockRejectedValue(
        new Error("Unknown JWT error"),
      );
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: true,
          sub: "user789",
          aud: audience,
        }),
      });

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("user789");
    });

    it("should work without audience validation", async () => {
      const validatorWithoutAudience = new OAuthTokenValidator(issuer);
      const token =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

      vi.mocked(jose.jwtVerify).mockResolvedValue({
        payload: { sub: "user123" },
        protectedHeader: {},
      } as any);

      const result = await validatorWithoutAudience.validateToken(token);

      expect(result.valid).toBe(true);
      expect(jose.jwtVerify).toHaveBeenCalledWith(
        token,
        expect.anything(),
        { issuer }, // No audience in options
      );
    });
  });

  describe("introspectToken", () => {
    it("should validate active tokens with correct audience", async () => {
      const token = "opaque-token-123";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: true,
          sub: "user123",
          aud: audience,
        }),
      });

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("user123");
    });

    it("should reject inactive tokens", async () => {
      const token = "inactive-token";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: false,
        }),
      });

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token is not active");
    });

    it("should reject tokens with wrong audience", async () => {
      const token = "wrong-audience-token";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: true,
          sub: "user123",
          aud: "different-audience",
        }),
      });

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid audience");
    });

    it("should handle introspection endpoint errors", async () => {
      const token = "error-token";

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token introspection failed");
    });

    it("should extract userId from different claim types", async () => {
      const testCases = [
        {
          token: "sub-token",
          response: { active: true, sub: "user-sub", aud: audience },
          expectedUserId: "user-sub",
        },
        {
          token: "userid-token",
          response: { active: true, user_id: "user-id", aud: audience },
          expectedUserId: "user-id",
        },
        {
          token: "username-token",
          response: { active: true, username: "username", aud: audience },
          expectedUserId: "username",
        },
      ];

      for (const testCase of testCases) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => testCase.response,
        });

        const result = await validator.validateToken(testCase.token);
        expect(result.valid).toBe(true);
        expect(result.userId).toBe(testCase.expectedUserId);
      }
    });

    it("should work without audience validation", async () => {
      const validatorWithoutAudience = new OAuthTokenValidator(issuer);
      const token = "no-audience-token";

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: true,
          sub: "user123",
          // No aud field
        }),
      });

      const result = await validatorWithoutAudience.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe("user123");
    });
  });
});

describe("BuiltinTokenValidator", () => {
  let validator: BuiltinTokenValidator;

  beforeEach(() => {
    validator = new BuiltinTokenValidator();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe("storeToken", () => {
    it("should store and validate tokens", async () => {
      const token = "test-token-123";
      const userId = "user123";
      const expiresAt = new Date(Date.now() + 60000); // 1 minute from now

      validator.storeToken(token, userId, expiresAt);

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe(userId);
    });

    it("should automatically delete expired tokens", async () => {
      vi.useFakeTimers();

      const token = "expiring-token";
      const userId = "user123";
      const expiresAt = new Date(Date.now() + 1000); // 1 second from now

      validator.storeToken(token, userId, expiresAt);

      // Token should be valid initially
      let result = await validator.validateToken(token);
      expect(result.valid).toBe(true);

      // Fast-forward time to after expiration
      vi.advanceTimersByTime(1001);

      // Token should be automatically deleted
      result = await validator.validateToken(token);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token not found");

      vi.useRealTimers();
    });
  });

  describe("validateToken", () => {
    it("should return error for non-existent tokens", async () => {
      const result = await validator.validateToken("non-existent-token");

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token not found");
    });

    it("should return error for manually expired tokens", async () => {
      const token = "expired-token";
      const userId = "user123";
      const expiresAt = new Date(Date.now() - 1000); // 1 second ago

      validator.storeToken(token, userId, expiresAt);

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token expired");
    });

    it("should handle validation errors gracefully", async () => {
      // Create a validator instance and mess with its internal state to cause an error
      const token = "test-token";
      validator.storeToken(token, "user123", new Date(Date.now() + 60000));

      // Mock the internal tokens map to throw an error
      const originalGet = Map.prototype.get;
      Map.prototype.get = vi.fn().mockImplementation(() => {
        throw new Error("Simulated error");
      });

      const result = await validator.validateToken(token);

      expect(result.valid).toBe(false);
      expect(result.error).toBe("Token validation failed");

      // Restore original method
      Map.prototype.get = originalGet;
    });

    it("should delete expired tokens when validating", async () => {
      const token = "will-expire-token";
      const userId = "user123";
      const expiresAt = new Date(Date.now() - 1000); // Already expired

      validator.storeToken(token, userId, expiresAt);

      // First validation should detect expiration and delete the token
      const firstResult = await validator.validateToken(token);
      expect(firstResult.valid).toBe(false);
      expect(firstResult.error).toBe("Token expired");

      // Second validation should not find the token at all
      const secondResult = await validator.validateToken(token);
      expect(secondResult.valid).toBe(false);
      expect(secondResult.error).toBe("Token not found");
    });
  });
});
