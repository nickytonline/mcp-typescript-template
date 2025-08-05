import { describe, it, expect, beforeEach, vi } from "vitest";

describe("config", () => {
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };

    delete process.env.PORT;
    delete process.env.NODE_ENV;
    delete process.env.SERVER_NAME;
    delete process.env.SERVER_VERSION;
    delete process.env.LOG_LEVEL;
    delete process.env.ENABLE_AUTH;
    delete process.env.OAUTH_ISSUER;
    delete process.env.OAUTH_AUDIENCE;
    delete process.env.OAUTH_CLIENT_ID;
    delete process.env.OAUTH_CLIENT_SECRET;

    vi.resetModules();
  });

  describe("getConfig", () => {
    it("should return default configuration when no environment variables are set", async () => {
      const { getConfig } = await import("./config.ts");
      const config = getConfig();
      expect(config.PORT).toBe(3000);
      expect(config.NODE_ENV).toBe("development");
      expect(config.SERVER_NAME).toBe("mcp-typescript-template");
      expect(config.SERVER_VERSION).toBe("1.0.0");
      expect(config.LOG_LEVEL).toBe("info");
      expect(config.ENABLE_AUTH).toBe(false);
    });

    it("should parse environment variables correctly", async () => {
      process.env.PORT = "8080";
      process.env.NODE_ENV = "production";
      process.env.SERVER_NAME = "test-server";
      process.env.SERVER_VERSION = "2.0.0";
      process.env.LOG_LEVEL = "debug";
      process.env.ENABLE_AUTH = "true";
      process.env.OAUTH_ISSUER = "https://issuer.example.com";
      process.env.OAUTH_CLIENT_ID = "client-id";
      process.env.OAUTH_CLIENT_SECRET = "client-secret";
      // Optional but recommended
      process.env.OAUTH_AUDIENCE = "test-audience";
      process.env.OAUTH_REDIRECT_URI = "http://localhost:8080/callback";

      vi.resetModules();

      const { getConfig } = await import("./config.ts");
      const config = getConfig();

      expect(config.PORT).toBe(8080);
      expect(config.NODE_ENV).toBe("production");
      expect(config.SERVER_NAME).toBe("test-server");
      expect(config.SERVER_VERSION).toBe("2.0.0");
      expect(config.LOG_LEVEL).toBe("debug");
      expect(config.ENABLE_AUTH).toBe(true);
    });

    it("should coerce PORT to number", async () => {
      process.env.PORT = "3001";

      const { getConfig } = await import("./config.ts");
      const config = getConfig();

      expect(config.PORT).toBe(3001);
      expect(typeof config.PORT).toBe("number");
    });

    it("should cache configuration on subsequent calls", async () => {
      process.env.SERVER_NAME = "first-call";

      const { getConfig } = await import("./config.ts");
      const firstConfig = getConfig();
      expect(firstConfig.SERVER_NAME).toBe("first-call");

      process.env.SERVER_NAME = "second-call";

      const secondConfig = getConfig();
      expect(secondConfig.SERVER_NAME).toBe("first-call");
    });

    // ...existing code...

    describe("enum validation", () => {
      it("should reject invalid NODE_ENV values", async () => {
        process.env.NODE_ENV = "invalid";

        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
          throw new Error("process.exit called");
        });

        const { getConfig } = await import("./config.ts");
        expect(() => getConfig()).toThrow("process.exit called");

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
      });

      it("should reject invalid LOG_LEVEL values", async () => {
        process.env.LOG_LEVEL = "invalid";

        const consoleSpy = vi
          .spyOn(console, "error")
          .mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
          throw new Error("process.exit called");
        });

        const { getConfig } = await import("./config.ts");
        expect(() => getConfig()).toThrow("process.exit called");

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
      });
    });
  });

  describe("isProduction", () => {
    it("should return true when NODE_ENV is production", async () => {
      process.env.NODE_ENV = "production";

      const { isProduction } = await import("./config.ts");
      expect(isProduction()).toBe(true);
    });

    it("should return false when NODE_ENV is not production", async () => {
      process.env.NODE_ENV = "development";

      const { isProduction } = await import("./config.ts");
      expect(isProduction()).toBe(false);
    });

    it("should return false for default NODE_ENV", async () => {
      const { isProduction } = await import("./config.ts");
      expect(isProduction()).toBe(false);
    });
  });

  describe("isDevelopment", () => {
    it("should return true when NODE_ENV is development", async () => {
      process.env.NODE_ENV = "development";

      const { isDevelopment } = await import("./config.ts");
      expect(isDevelopment()).toBe(true);
    });

    it("should return false when NODE_ENV is not development", async () => {
      process.env.NODE_ENV = "production";

      const { isDevelopment } = await import("./config.ts");
      expect(isDevelopment()).toBe(false);
    });

    it("should return true for default NODE_ENV", async () => {
      const { isDevelopment } = await import("./config.ts");
      expect(isDevelopment()).toBe(true);
    });
  });
});
