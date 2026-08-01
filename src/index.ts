import express from "express";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { logger } from "./logger.ts";
import { getConfig } from "./config.ts";
import { registerTools } from "./tools.ts";

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

// createMcpHandler runs the factory fresh per request (2026-07-28 spec: no
// initialize/initialized handshake, no Mcp-Session-Id). It also answers
// 2025-era stateful clients automatically via a stateless per-request
// fallback, so no dual-transport wiring is needed for a transition period.
const handler = createMcpHandler(getServer, {
  onerror: (error) => {
    logger.error({ error: error.message }, "Error handling MCP request");
  },
});

const nodeHandler = toNodeHandler(handler, {
  onerror: (error) => {
    logger.error({ error: error.message }, "Error adapting MCP request for Node");
  },
});

const app = express();
app.use(express.json());

// There's no session to key a health check off anymore, so /mcp itself no
// longer doubles as one (GET on it now goes through the MCP handler, not a
// plain info response). Use a dedicated endpoint instead.
app.get("/health", (_req, res) => {
  const config = getConfig();
  res.json({
    name: config.SERVER_NAME,
    version: config.SERVER_VERSION,
    description: "TypeScript template for building MCP servers",
    capabilities: ["tools"],
  });
});

app.all("/mcp", (req, res) => {
  nodeHandler(req, res, req.body).catch((error) => {
    logger.error(
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
  });
});

async function main() {
  const config = getConfig();

  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    void handler.close().finally(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT received, shutting down gracefully");
    void handler.close().finally(() => process.exit(0));
  });

  app.listen(config.PORT, () => {
    logger.info(
      {
        environment: config.NODE_ENV,
        serverName: config.SERVER_NAME,
        version: config.SERVER_VERSION,
      },
      `MCP TypeScript Template Server running on port ${config.PORT}`,
    );
  });
}

main().catch((error) => {
  logger.error(
    { error: error instanceof Error ? error.message : String(error) },
    "Server startup error",
  );
  process.exit(1);
});
