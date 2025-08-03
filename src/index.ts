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
import { createOAuthProviderAuthMiddleware } from "./auth/middleware.ts";
import { 
  createAuthorizationServerMetadataHandler, 
  createProtectedResourceMetadataHandler
} from "./auth/discovery.ts";
import {
  createAuthorizeHandler,
  createCallbackHandler,
  createTokenHandler
} from "./auth/routes.ts";
import { OAuthProvider } from "./auth/oauth-provider.ts";

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
      const transport = transports[sessionId];
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // Handle case where no session ID is provided for non-init requests
    if (req.method === "POST" && !sessionId) {
      logger.warn(
        "POST request without session ID for non-initialization request",
      );
      res
        .status(400)
        .json({ error: "Session ID required for non-initialization requests" });
      return;
    }

    // Handle unknown session
    if (sessionId && !transports[sessionId]) {
      logger.warn("Request for unknown session", { sessionId });
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // For GET requests without session, return server info
    if (req.method === "GET") {
      const config = getConfig();
      const capabilities = ["tools"];
      
      if (config.AUTH_MODE !== "none") {
        capabilities.push("oauth");
      }
      
      res.json({
        name: config.SERVER_NAME,
        version: config.SERVER_VERSION,
        description: "TypeScript template for building MCP servers",
        capabilities,
        ...(config.AUTH_MODE !== "none" && {
          oauth: {
            authorization_server: `${config.BASE_URL || "http://localhost:3000"}/.well-known/oauth-authorization-server`,
            protected_resource: `${config.BASE_URL || "http://localhost:3000"}/.well-known/oauth-protected-resource`,
            authorization_endpoint: `${config.BASE_URL || "http://localhost:3000"}/oauth/authorize`,
            token_endpoint: `${config.BASE_URL || "http://localhost:3000"}/oauth/token`
          }
        })
      });
    }
  } catch (error) {
    logger.error("Error handling MCP request", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
};

const config = getConfig();
let oauthProvider: OAuthProvider | null = null;

if (config.AUTH_MODE === "full") {
  oauthProvider = new OAuthProvider({
    clientId: "mcp-client",
    clientSecret: "mcp-secret",
    authorizationEndpoint: `${config.BASE_URL || "http://localhost:3000"}/oauth/authorize`,
    tokenEndpoint: `${config.BASE_URL || "http://localhost:3000"}/oauth/token`,
    scope: config.OAUTH_SCOPE,
    redirectUri: config.OAUTH_REDIRECT_URI!
  });
  
  app.get("/.well-known/oauth-authorization-server", createAuthorizationServerMetadataHandler());
  app.get("/.well-known/oauth-protected-resource", createProtectedResourceMetadataHandler());
  app.get("/.well-known/openid_configuration", createAuthorizationServerMetadataHandler());
  
  // Extract path from redirect URI for route registration
  const redirectPath = new URL(config.OAUTH_REDIRECT_URI!).pathname;
  
  app.get("/oauth/authorize", createAuthorizeHandler());
  app.get(redirectPath, createCallbackHandler(oauthProvider));
  app.post("/oauth/token", express.urlencoded({ extended: true }), createTokenHandler(oauthProvider));
  
  logger.info("OAuth 2.1 client delegation endpoints registered for full auth mode", { 
    discovery: [
      "/.well-known/oauth-authorization-server", 
      "/.well-known/oauth-protected-resource",
      "/.well-known/openid_configuration"
    ],
    endpoints: ["/oauth/authorize", redirectPath, "/oauth/token"],
    externalIdP: config.OAUTH_ISSUER
  });
}

let authMiddleware;
if (config.AUTH_MODE === "full" && oauthProvider) {
  authMiddleware = createOAuthProviderAuthMiddleware(oauthProvider);
  logger.info("Using OAuthProvider authentication for MCP endpoints");
} else {
  authMiddleware = createAuthenticationMiddleware();
  logger.info("Using standard authentication for MCP endpoints");
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
