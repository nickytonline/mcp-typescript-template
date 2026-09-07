import { Config as EffectConfig, ConfigProvider, Effect } from "effect";

const configEffect = EffectConfig.all({
  PORT: EffectConfig.number("PORT").pipe(EffectConfig.withDefault(3000)),
  NODE_ENV: EffectConfig.literal("development", "production", "test")("NODE_ENV").pipe(
    EffectConfig.withDefault("development"),
  ),
  SERVER_NAME: EffectConfig.string("SERVER_NAME").pipe(
    EffectConfig.withDefault("mcp-typescript-template"),
  ),
  SERVER_VERSION: EffectConfig.string("SERVER_VERSION").pipe(
    EffectConfig.withDefault("1.0.0"),
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
