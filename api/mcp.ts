import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createTextResult } from "../lib/utils.js";
import { logger } from "../logger.js";
import { getConfig } from "../config.js";

// Store transports in memory (Vercel KV would be better for production)
// Note: This is simplified for demonstration. For production, consider using
// Vercel KV or another persistent store to maintain sessions across function invocations
const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

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

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  // Set CORS headers for API access
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, mcp-session-id",
  );

  // Handle OPTIONS for CORS preflight
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

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
      
      // Create a minimal Express-like request/response adapter
      const expressReq = {
        body: req.body,
        headers: req.headers,
        method: req.method,
      };
      
      const expressRes = {
        status: (code: number) => {
          res.status(code);
          return expressRes;
        },
        setHeader: (name: string, value: string) => {
          res.setHeader(name, value);
          return expressRes;
        },
        json: (data: any) => {
          res.json(data);
        },
        send: (data: any) => {
          res.send(data);
        },
        end: () => {
          res.end();
        },
      };

      await transport.handleRequest(expressReq as any, expressRes as any, req.body);
      return;
    }

    // Handle existing session requests
    if (sessionId && transports[sessionId]) {
      const transport = transports[sessionId];
      
      const expressReq = {
        body: req.body,
        headers: req.headers,
        method: req.method,
      };
      
      const expressRes = {
        status: (code: number) => {
          res.status(code);
          return expressRes;
        },
        setHeader: (name: string, value: string) => {
          res.setHeader(name, value);
          return expressRes;
        },
        json: (data: any) => {
          res.json(data);
        },
        send: (data: any) => {
          res.send(data);
        },
        end: () => {
          res.end();
        },
      };

      await transport.handleRequest(expressReq as any, expressRes as any, req.body);
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
      res.json({
        name: config.SERVER_NAME,
        version: config.SERVER_VERSION,
        description: "TypeScript template for building MCP servers (Vercel Serverless)",
        capabilities: ["tools"],
        deployment: "vercel-serverless",
      });
      return;
    }
  } catch (error) {
    logger.error("Error handling MCP request", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
}
