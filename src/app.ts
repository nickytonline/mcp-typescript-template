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

/** Creates the Express app and MCP handler used by the production entrypoint. */
export function createApp() {
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

  return { app, handler };
}
