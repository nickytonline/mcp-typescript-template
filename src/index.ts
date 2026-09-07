import type { Server as HttpServer } from "node:http";
import express from "express";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { Effect } from "effect";
import { logger } from "./logger.ts";
import { getConfig } from "./config.ts";
import { registerTools } from "./tools.ts";
import { runMcpEffect } from "./lib/utils.ts";

const getServer = () => {
  const config = getConfig();
  const server = new McpServer(
    {
      name: config.SERVER_NAME,
      version: config.SERVER_VERSION,
    },
    {
      capabilities: {
        logging: {},
      },
    },
  );

  registerTools(server);

  return server;
};

/**
 * Starts the HTTP server as an Effect workflow. The MCP SDK remains the
 * transport boundary; Effect owns startup, request failure handling, and
 * graceful shutdown around it.
 */
const main = Effect.gen(function* () {
  const config = getConfig();

  // createMcpHandler runs the factory fresh per request (2026-07-28 spec: no
  // initialize/initialized handshake, no Mcp-Session-Id). It also answers
  // 2025-era clients automatically via a stateless per-request fallback.
  const handler = createMcpHandler(getServer, {
    onerror: (error) => {
      void runMcpEffect(logger.error({ error: error.message }, "Error handling MCP request"));
    },
  });

  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => {
      void runMcpEffect(
        logger.error(
          { error: error.message },
          "Error adapting MCP request for Node",
        ),
      );
    },
  });

  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.all("/mcp", (req, res) => {
    void runMcpEffect(
      Effect.tryPromise({
        try: () => nodeHandler(req, res, req.body),
        catch: (error) => error,
      }).pipe(
        Effect.catchAll((error) =>
          Effect.gen(function* () {
            yield* logger.error(
              { error: error instanceof Error ? error.message : String(error) },
              "Unhandled error serving MCP request",
            );
            if (!res.headersSent) {
              res.status(500).json({
                jsonrpc: "2.0",
                error: { code: -32603, message: "Internal server error" },
                id: null,
              });
            } else {
              res.end();
            }
          }),
        ),
      ),
    );
  });

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
    void runMcpEffect(
      Effect.gen(function* () {
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
      }).pipe(
        Effect.ensuring(Effect.sync(() => process.exit(0))),
        Effect.catchAll((error) =>
          logger.error(
            { error: error instanceof Error ? error.message : String(error) },
            "Error during graceful shutdown",
          ),
        ),
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
