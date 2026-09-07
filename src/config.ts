import { Config as EffectConfig, ConfigProvider, Effect } from "effect";

export type Config = {
  readonly PORT: number;
  readonly NODE_ENV: "development" | "production" | "test";
  readonly SERVER_NAME: string;
  readonly SERVER_VERSION: string;
  readonly LOG_LEVEL: "error" | "warn" | "info" | "debug";
};

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

const loadConfig = Effect.withConfigProvider(ConfigProvider.fromEnv())(configEffect);

let config: Config | undefined;

export function getConfig(): Config {
  if (!config) {
    try {
      config = Effect.runSync(loadConfig);
    } catch (error) {
      process.stderr.write(`Invalid environment configuration: ${String(error)}\n`);
      process.exit(1);
    }
  }
  return config as Config;
}

export function isProduction(): boolean {
  return getConfig().NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return getConfig().NODE_ENV === "development";
}
