import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { packageJsonPath, packageMetadataFrom, readPackageMetadata } from "./config.ts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function importConfig() {
  vi.resetModules();
  return import("./config.ts");
}

describe("configuration", () => {
  it("uses the documented defaults", async () => {
    vi.stubEnv("PORT", undefined);
    vi.stubEnv("NODE_ENV", undefined);
    vi.stubEnv("SERVER_NAME", undefined);
    vi.stubEnv("SERVER_VERSION", undefined);
    vi.stubEnv("LOG_LEVEL", undefined);

    const { getConfig } = await importConfig();

    expect(getConfig()).toEqual({
      PORT: 3000,
      NODE_ENV: "development",
      SERVER_NAME: packageJson.name,
      SERVER_VERSION: packageJson.version,
      LOG_LEVEL: "info",
    });
  });

  it("loads and parses environment values", async () => {
    vi.stubEnv("PORT", "4311");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("SERVER_NAME", "custom-server");
    vi.stubEnv("SERVER_VERSION", "2.0.0");
    vi.stubEnv("LOG_LEVEL", "debug");

    const { getConfig } = await importConfig();

    expect(getConfig()).toEqual({
      PORT: 4311,
      NODE_ENV: "test",
      SERVER_NAME: "custom-server",
      SERVER_VERSION: "2.0.0",
      LOG_LEVEL: "debug",
    });
  });

  it("exits when environment configuration is invalid", async () => {
    vi.stubEnv("PORT", "not-a-number");
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`process.exit(${code})`);
    });

    const { getConfig } = await importConfig();

    expect(() => getConfig()).toThrow("process.exit(1)");
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining("Invalid environment configuration"),
    );
  });
});

describe("package.json metadata", () => {
  it("resolves package.json above both src and dist", () => {
    expect(packageJsonPath(join("app", "src"))).toBe(join("app", "package.json"));
    expect(packageJsonPath(join("app", "dist"))).toBe(join("app", "package.json"));
  });

  it("reads name and version from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-package-"));
    const path = join(dir, "package.json");
    writeFileSync(path, JSON.stringify({ name: "demo-server", version: "3.2.1", private: true }));

    expect(readPackageMetadata(path)).toEqual({ name: "demo-server", version: "3.2.1" });
  });

  it("reads name and version from a parsed object", () => {
    expect(packageMetadataFrom({ name: "demo-server", version: "3.2.1", private: true })).toEqual({
      name: "demo-server",
      version: "3.2.1",
    });
  });

  it("rejects a missing or invalid package.json file", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-package-"));
    const missing = join(dir, "package.json");
    const invalid = join(dir, "invalid.json");
    writeFileSync(invalid, "{");

    expect(() => readPackageMetadata(missing)).toThrow(`Unable to read package.json at ${missing}`);
    expect(() => readPackageMetadata(invalid)).toThrow(
      `package.json at ${invalid} is not valid JSON`,
    );
  });

  it("rejects values that are not a package.json object", () => {
    expect(() => packageMetadataFrom(null)).toThrow("package.json must be a JSON object");
    expect(() => packageMetadataFrom("mcp-typescript-template")).toThrow(
      "package.json must be a JSON object",
    );
  });

  it("rejects a missing or empty name or version", () => {
    expect(() => packageMetadataFrom({ version: "1.0.0" })).toThrow(
      "package.json name must be a non-empty string",
    );
    expect(() => packageMetadataFrom({ name: "", version: "1.0.0" })).toThrow(
      "package.json name must be a non-empty string",
    );
    expect(() => packageMetadataFrom({ name: "demo-server", version: 1 })).toThrow(
      "package.json version must be a non-empty string",
    );
    expect(() => packageMetadataFrom({ name: "demo-server", version: "" })).toThrow(
      "package.json version must be a non-empty string",
    );
  });
});
