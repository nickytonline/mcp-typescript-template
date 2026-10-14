import { Config as EffectConfig, ConfigProvider, Effect } from "effect";
import packageJson from "../package.json" with { type: "json" };

const configEffect = EffectConfig.all({
  PORT: EffectConfig.Number("PORT").pipe(EffectConfig.withDefault(3000)),
  NODE_ENV: EffectConfig.Literals(
    ["development", "production", "test"],
    "NODE_ENV",
  ).pipe(EffectConfig.withDefault("development")),
  SERVER_NAME: EffectConfig.String("SERVER_NAME").pipe(
    EffectConfig.withDefault(packageJson.name),
  ),
  SERVER_VERSION: EffectConfig.String("SERVER_VERSION").pipe(
    EffectConfig.withDefault(packageJson.version),
  ),
  LOG_LEVEL: EffectConfig.Literals(
    ["error", "warn", "info", "debug"],
    "LOG_LEVEL",
  ).pipe(EffectConfig.withDefault("info")),
});

export type Config = Effect.Success<typeof configEffect>;

const loadConfig = configEffect.parse(ConfigProvider.fromEnv());

let config: Config | undefined;

function failInvalidConfig(cause: unknown): never {
  process.stderr.write(`Invalid environment configuration: ${String(cause)}\n`);
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
