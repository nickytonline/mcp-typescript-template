import type { Server as HttpServer } from "node:http";
import { Effect } from "effect";
import { logger } from "./logger.ts";
import { getConfig } from "./config.ts";
import { createApp } from "./app.ts";
import { runMcpEffect } from "./lib/utils.ts";

/**
 * Starts the HTTP server as an Effect workflow. The MCP SDK remains the
 * transport boundary; Effect owns startup, request failure handling, and
 * graceful shutdown around it.
 */
const main = Effect.gen(function* () {
  const config = getConfig();
  const { app, handler } = createApp();

  const httpServer = yield* Effect.async<HttpServer, unknown>((resume) => {
    const server = app.listen(config.PORT, () => {
      resume(Effect.succeed(server));
    });
    server.once("error", (error) => resume(Effect.fail(error)));
  });

  const closeHttpServer = Effect.tryPromise({
    try: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.close((error) => (error ? reject(error) : resolve()));
      }),
    catch: (error) => error,
  });

  const shutdown = (signal: string) => {
    const shutdownEffect = Effect.gen(function* () {
      yield* logger.info(`${signal} received, shutting down gracefully`);
      yield* Effect.all(
        [
          Effect.tryPromise({
            try: () => handler.close(),
            catch: (error) => error,
          }),
          closeHttpServer,
        ],
        { concurrency: "unbounded" },
      ).pipe(Effect.asVoid);
    });

    void runMcpEffect(
      shutdownEffect.pipe(
        Effect.matchEffect({
          onSuccess: () => Effect.sync(() => process.exit(0)),
          onFailure: (error) =>
            logger.error(
              { error: error instanceof Error ? error.message : String(error) },
              "Error during graceful shutdown",
            ).pipe(Effect.andThen(Effect.sync(() => process.exit(1)))),
        }),
      ),
    );
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));

  yield* logger.info(
    {
      environment: config.NODE_ENV,
      serverName: config.SERVER_NAME,
      version: config.SERVER_VERSION,
    },
    `MCP TypeScript Template Server running on port ${config.PORT}`,
  );

  yield* Effect.never;
});

runMcpEffect(main).catch((error) => {
  void runMcpEffect(
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Server startup error",
    ),
  ).finally(() => process.exit(1));
});
