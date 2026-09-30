import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Config as EffectConfig, ConfigProvider, Effect } from "effect";

export type PackageMetadata = {
  readonly name: string;
  readonly version: string;
};

/**
 * package.json sits next to both `src/` (dev, via Node type stripping) and
 * `dist/` (the Vite bundle), so the manifest is one directory above this module.
 */
export function packageJsonPath(moduleDir: string = import.meta.dirname): string {
  return join(moduleDir, "..", "package.json");
}

/** Reads the MCP server name and version from package.json on disk. */
export function readPackageMetadata(packageJsonPath: string): PackageMetadata {
  let raw: string;
  try {
    raw = readFileSync(packageJsonPath, "utf8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read package.json at ${packageJsonPath}: ${detail}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`package.json at ${packageJsonPath} is not valid JSON`);
  }

  return packageMetadataFrom(parsed);
}

/** Reads the MCP server identity from a parsed package.json object. */
export function packageMetadataFrom(source: unknown): PackageMetadata {
  if (typeof source !== "object" || source === null) {
    throw new Error("package.json must be a JSON object");
  }

  const record = source as { name?: unknown; version?: unknown };
  return {
    name: requiredPackageString(record.name, "name"),
    version: requiredPackageString(record.version, "version"),
  };
}

function requiredPackageString(value: unknown, field: "name" | "version"): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`package.json ${field} must be a non-empty string`);
  }
  return value;
}

const packageMetadata = readPackageMetadata(packageJsonPath());

const configEffect = EffectConfig.all({
  PORT: EffectConfig.number("PORT").pipe(EffectConfig.withDefault(3000)),
  NODE_ENV: EffectConfig.literal("development", "production", "test")("NODE_ENV").pipe(
    EffectConfig.withDefault("development"),
  ),
  SERVER_NAME: EffectConfig.string("SERVER_NAME").pipe(
    EffectConfig.withDefault(packageMetadata.name),
  ),
  SERVER_VERSION: EffectConfig.string("SERVER_VERSION").pipe(
    EffectConfig.withDefault(packageMetadata.version),
  ),
  LOG_LEVEL: EffectConfig.literal("error", "warn", "info", "debug")("LOG_LEVEL").pipe(
    EffectConfig.withDefault("info"),
  ),
});

export type Config = typeof configEffect extends EffectConfig.Config<infer ConfigValue>
  ? ConfigValue
  : never;

const loadConfig = Effect.withConfigProvider(ConfigProvider.fromEnv())(configEffect);

let config: Config | undefined;

function failInvalidConfig(error: unknown): never {
  process.stderr.write(`Invalid environment configuration: ${String(error)}\n`);
  process.exit(1);
}

export function getConfig(): Config {
  if (!config) {
    try {
      config = Effect.runSync(loadConfig);
    } catch (error) {
      return failInvalidConfig(error);
    }
  }
  return config;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === "development";
}
