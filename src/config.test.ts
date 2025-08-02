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
    delete process.env.AUTH_MODE;
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
      expect(config.AUTH_MODE).toBe("none");
    });

    it("should parse environment variables correctly", async () => {
      process.env.PORT = "8080";
      process.env.NODE_ENV = "production";
      process.env.SERVER_NAME = "test-server";
      process.env.SERVER_VERSION = "2.0.0";
      process.env.LOG_LEVEL = "debug";
      process.env.AUTH_MODE = "full";
      process.env.OAUTH_ISSUER = "https://issuer.example.com";
      process.env.OAUTH_CLIENT_ID = "client-id";
      process.env.OAUTH_CLIENT_SECRET = "client-secret";

      const { getConfig } = await import("./config.ts");
      const config = getConfig();

      expect(config.PORT).toBe(8080);
      expect(config.NODE_ENV).toBe("production");
      expect(config.SERVER_NAME).toBe("test-server");
      expect(config.SERVER_VERSION).toBe("2.0.0");
      expect(config.LOG_LEVEL).toBe("debug");
      expect(config.AUTH_MODE).toBe("full");
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

    describe("AUTH_MODE validation", () => {
      it("should require OAuth configuration when AUTH_MODE is full", async () => {
        process.env.AUTH_MODE = "full";
        // Missing required OAuth vars

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
          throw new Error("process.exit called");
        });

        const { getConfig } = await import("./config.ts");
        expect(() => getConfig()).toThrow("process.exit called");
        expect(consoleSpy).toHaveBeenCalledWith(
          "❌ Invalid environment configuration:",
          expect.any(Error)
        );

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
      });

      it("should accept complete OAuth configuration for AUTH_MODE=full", async () => {
        process.env.AUTH_MODE = "full";
        process.env.OAUTH_ISSUER = "https://issuer.example.com";
        process.env.OAUTH_CLIENT_ID = "client-id";
        process.env.OAUTH_CLIENT_SECRET = "client-secret";

        const { getConfig } = await import("./config.ts");
        const config = getConfig();

        expect(config.AUTH_MODE).toBe("full");
        expect(config.OAUTH_ISSUER).toBe("https://issuer.example.com");
        expect(config.OAUTH_CLIENT_ID).toBe("client-id");
        expect(config.OAUTH_CLIENT_SECRET).toBe("client-secret");
      });

      it("should warn when OAUTH_AUDIENCE is missing for full mode", async () => {
        process.env.AUTH_MODE = "full";
        process.env.OAUTH_ISSUER = "https://issuer.example.com";
        process.env.OAUTH_CLIENT_ID = "client-id";
        process.env.OAUTH_CLIENT_SECRET = "client-secret";
        // Missing OAUTH_AUDIENCE

        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const { getConfig } = await import("./config.ts");
        const config = getConfig();

        expect(config.AUTH_MODE).toBe("full");
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("⚠️  OAUTH_AUDIENCE not set for full mode")
        );

        warnSpy.mockRestore();
      });

      it("should require OAUTH_ISSUER for resource_server mode", async () => {
        process.env.AUTH_MODE = "resource_server";
        // Missing OAUTH_ISSUER

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
          throw new Error("process.exit called");
        });

        const { getConfig } = await import("./config.ts");
        expect(() => getConfig()).toThrow("process.exit called");

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
      });

      it("should error when OAUTH_AUDIENCE is missing for resource_server mode", async () => {
        process.env.AUTH_MODE = "resource_server";
        process.env.OAUTH_ISSUER = "https://issuer.example.com";
        // Missing OAUTH_AUDIENCE

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
          throw new Error("process.exit called");
        });

        const { getConfig } = await import("./config.ts");
        expect(() => getConfig()).toThrow("process.exit called");

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
      });

      it("should accept resource_server mode with complete configuration", async () => {
        process.env.AUTH_MODE = "resource_server";
        process.env.OAUTH_ISSUER = "https://issuer.example.com";
        process.env.OAUTH_AUDIENCE = "mcp-server";

        const { getConfig } = await import("./config.ts");
        const config = getConfig();

        expect(config.AUTH_MODE).toBe("resource_server");
        expect(config.OAUTH_ISSUER).toBe("https://issuer.example.com");
        expect(config.OAUTH_AUDIENCE).toBe("mcp-server");
      });

      it("should work with AUTH_MODE=none without OAuth configuration", async () => {
        process.env.AUTH_MODE = "none";

        const { getConfig } = await import("./config.ts");
        const config = getConfig();

        expect(config.AUTH_MODE).toBe("none");
        expect(config.OAUTH_ISSUER).toBeUndefined();
        expect(config.OAUTH_CLIENT_ID).toBeUndefined();
        expect(config.OAUTH_CLIENT_SECRET).toBeUndefined();
      });
    });

    describe("enum validation", () => {
      it("should reject invalid NODE_ENV values", async () => {
        process.env.NODE_ENV = "invalid";

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
          throw new Error("process.exit called");
        });

        const { getConfig } = await import("./config.ts");
        expect(() => getConfig()).toThrow("process.exit called");

        consoleSpy.mockRestore();
        exitSpy.mockRestore();
      });

      it("should reject invalid AUTH_MODE values", async () => {
        process.env.AUTH_MODE = "invalid";

        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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