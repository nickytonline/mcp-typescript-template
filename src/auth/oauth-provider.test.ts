import { describe, it, expect, beforeEach } from "vitest";
import { OAuthProvider } from "./oauth-provider";

const config = {
  clientId: "test-client",
  clientSecret: "test-secret",
  authorizationEndpoint: "http://localhost/oauth/authorize",
  tokenEndpoint: "http://localhost/oauth/token",
  scope: "openid profile email",
  redirectUri: "http://localhost/callback",
};

describe("OAuthProvider", () => {
  let provider: OAuthProvider;

  beforeEach(() => {
    provider = new OAuthProvider(config);
  });

  it("should store and exchange authorization codes via public API", async () => {
    const code = "code123";
    const codeChallenge = "challenge";
    provider.storeAuthorizationCode(code, {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: "openid",
      codeChallenge,
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() + 60000),
    });
    // Should fail PKCE verification (challenge won't match), so returns null
    const result = await provider.exchangeAuthorizationCode(
      code,
      "wrong_verifier",
      config.clientId,
      config.redirectUri,
    );
    expect(result).toBeNull();

    // Now use correct PKCE verifier
    // To generate correct PKCE challenge:
    // S256: base64url(sha256(verifier)) === challenge
    // We'll use a helper here for the test
    const crypto = await import("node:crypto");
    const verifier = "test_verifier";
    const correctChallenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");
    provider.storeAuthorizationCode("code456", {
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scope: "openid",
      codeChallenge: correctChallenge,
      codeChallengeMethod: "S256",
      expiresAt: new Date(Date.now() + 60000),
    });
    const validResult = await provider.exchangeAuthorizationCode(
      "code456",
      verifier,
      config.clientId,
      config.redirectUri,
    );
    expect(validResult).not.toBeNull();
    expect(validResult?.accessToken).toMatch(/^mcp_/);
    expect(validResult?.scope).toBe("openid");
  });

  it("should verify PKCE correctly", () => {
    // @ts-ignore
    expect(provider["verifyPKCE"]("abc", "").toString()).toBe("false");
    // Real PKCE test would require correct challenge
  });

  it("should generate user IDs in expected format", () => {
    // @ts-ignore
    const userId = provider["generateUserId"]();
    expect(userId.startsWith("user-")).toBe(true);
    expect(userId.length).toBeGreaterThan(10);
  });

  it("should return valid: false for invalid token", async () => {
    const result = await provider.validateToken("");
    expect(result.valid).toBe(false);
  });

  // Add more tests for exchangeAuthorizationCode, cleanup, etc. as needed
});
