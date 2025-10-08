import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createTextResult } from "./lib/utils.ts";
import { logger } from "./logger.ts";
import { getConfig } from "./config.ts";
import { createAuthenticationMiddleware } from "./auth/index.ts";
import {
  createAuthorizationServerMetadataHandler,
  createProtectedResourceMetadataHandler,
} from "./auth/discovery.ts";

const getServer = () => {
  const config = getConfig();
  const server = new McpServer({
    name: config.SERVER_NAME,
    version: config.SERVER_VERSION,
  });

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echo back the provided message",
      inputSchema: {
        message: z.string().describe("The message to echo back"),
      },
    },
    async (args) => {
      const data = { echo: args.message };
      return createTextResult(data);
    },
  );

  return server;
};

const app = express();
app.use(express.json());

const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};
const sessionTimestamps: { [sessionId: string]: Date } = {};

const mcpHandler = async (req: express.Request, res: express.Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    // Handle initialization requests (usually POST without session ID)
    if (req.method === "POST" && !sessionId && isInitializeRequest(req.body)) {
      logger.info("Initializing new MCP session");

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
          sessionTimestamps[sessionId] = new Date();
          logger.info("MCP session initialized", { sessionId });
        },
      });

      const server = getServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Handle existing session requests
    if (sessionId && transports[sessionId]) {
      // Update session timestamp
      sessionTimestamps[sessionId] = new Date();
      const transport = transports[sessionId];
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Handle case where no session ID is provided for non-init requests
    if (req.method === "POST" && !sessionId) {
      logger.warn(
        "POST request without session ID for non-initialization request",
      );
      res.status(400).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32600,
          message: "Session ID required for non-initialization requests",
        },
      });
      return;
    }

    // Handle unknown session
    if (sessionId && !transports[sessionId]) {
      logger.warn("Request for unknown session", { sessionId });
      res.status(404).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32000,
          message: "Session not found",
        },
      });
      return;
    }

    // For GET requests without session, return server info
    if (req.method === "GET") {
      const config = getConfig();
      const capabilities = ["tools"];

      if (config.ENABLE_AUTH) {
        capabilities.push("oauth");
      }

      res.json({
        name: config.SERVER_NAME,
        version: config.SERVER_VERSION,
        description: "TypeScript template for building MCP servers",
        capabilities,
        ...(config.ENABLE_AUTH && {
          oauth: {
            // Point directly to Auth0 for OAuth
            authorization_endpoint: new URL(
              "/oauth/authorize",
              config.OAUTH_ISSUER,
            ).toString(),
            token_endpoint: new URL(
              "/oauth/token",
              config.OAUTH_ISSUER,
            ).toString(),
          },
        }),
      });
    }
  } catch (error) {
    logger.error("Error handling MCP request", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: "Internal server error",
      },
    });
  }
};

/**
 * Clean up stale MCP sessions
 */
function cleanupStaleSessions(): void {
  const now = new Date();
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  let cleanedCount = 0;

  for (const [sessionId, timestamp] of Object.entries(sessionTimestamps)) {
    if (now.getTime() - timestamp.getTime() > SESSION_TIMEOUT_MS) {
      // Close transport if it exists
      const transport = transports[sessionId];
      if (transport) {
        try {
          transport.close?.();
        } catch (error) {
          logger.warn("Error closing stale transport", {
            sessionId,
            error: error instanceof Error ? error.message : error,
          });
        }
        delete transports[sessionId];
      }

      delete sessionTimestamps[sessionId];
      cleanedCount++;

      logger.debug("Cleaned up stale MCP session", { sessionId });
    }
  }

  if (cleanedCount > 0) {
    logger.info("MCP session cleanup completed", {
      cleanedSessions: cleanedCount,
      activeSessions: Object.keys(transports).length,
    });
  }
}

// Schedule MCP session cleanup every 10 minutes
setInterval(cleanupStaleSessions, 10 * 60 * 1000);

const config = getConfig();

// Setup OAuth discovery and authentication middleware
if (config.ENABLE_AUTH) {
  // Serve OAuth discovery endpoints pointing to Auth0
  app.get(
    "/.well-known/oauth-authorization-server",
    createAuthorizationServerMetadataHandler(),
  );
  app.get(
    "/.well-known/oauth-protected-resource",
    createProtectedResourceMetadataHandler(),
  );
  app.get(
    "/.well-known/openid_configuration",
    createAuthorizationServerMetadataHandler(),
  );

  logger.info("OAuth discovery endpoints registered", {
    discovery: [
      "/.well-known/oauth-authorization-server",
      "/.well-known/oauth-protected-resource",
      "/.well-known/openid_configuration",
    ],
    issuer: config.OAUTH_ISSUER,
  });
}

// Setup authentication middleware (token validation only)
let authMiddleware;
if (config.ENABLE_AUTH) {
  authMiddleware = createAuthenticationMiddleware();
  logger.info("Using OAuth 2.1 token validation for MCP endpoints");
} else {
  authMiddleware = (_req: any, _res: any, next: any) => next();
  logger.info("Authentication disabled - MCP endpoints are public");
}

app.get("/mcp", mcpHandler);
app.post("/mcp", authMiddleware, mcpHandler);

async function main() {
  const config = getConfig();

  // Graceful shutdown handling
  process.on("SIGTERM", () => {
    logger.info("SIGTERM received, shutting down gracefully");
    process.exit(0);
  });

  process.on("SIGINT", () => {
    logger.info("SIGINT received, shutting down gracefully");
    process.exit(0);
  });

  app.listen(config.PORT, () => {
    logger.info(
      `MCP TypeScript Template Server running on port ${config.PORT}`,
      {
        environment: config.NODE_ENV,
        serverName: config.SERVER_NAME,
        version: config.SERVER_VERSION,
      },
    );
  });
}

main().catch((error) => {
  logger.error("Server startup error", {
    error: error instanceof Error ? error.message : error,
  });
  process.exit(1);
});
