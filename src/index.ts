import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createTextResult } from "./lib/utils.ts";

const getServer = () => {
  const server = new McpServer({
    name: "mcp-typescript-template",
    version: "1.0.0",
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

  // Handle initialization requests (usually POST without session ID)
  if (req.method === "POST" && !sessionId && isInitializeRequest(req.body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports[sessionId] = transport;
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
    res
      .status(400)
      .json({ error: "Session ID required for non-initialization requests" });
    return;
  }

  // Handle unknown session
  if (sessionId && !transports[sessionId]) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  // For GET requests without session, return server info
  if (req.method === "GET") {
    res.json({
      name: "mcp-typescript-template",
      version: "1.0.0",
      description: "TypeScript template for building MCP servers",
      capabilities: ["tools"],
    });
  }
};

// Handle MCP requests on /mcp endpoint
app.post("/mcp", mcpHandler);
app.get("/mcp", mcpHandler);

async function main() {
  const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.listen(port, () => {
    console.log(`MCP TypeScript Template Server running on port ${port}`);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
