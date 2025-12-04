import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createTextResult } from "./lib/utils.ts";
import { logger } from "./logger.ts";
import { getConfig } from "./config.ts";
import { createSamplingContext } from "./lib/sampling.ts";
import { createSafePrompt } from "./lib/sampling-security.ts";
import {
  SamplingNotSupportedError,
  SamplingTimeoutError,
  SamplingError,
} from "./types/sampling.ts";

const getServer = () => {
  const config = getConfig();
  const server = new McpServer({
    name: config.SERVER_NAME,
    version: config.SERVER_VERSION,
  });

  // Create sampling context if enabled
  const samplingContext = config.SAMPLING_ENABLED
    ? createSamplingContext(server.server, {
        timeout_ms: config.SAMPLING_TIMEOUT_MS,
        log_requests: config.SAMPLING_LOG_REQUESTS,
        log_usage: config.SAMPLING_LOG_USAGE,
      })
    : null;

  // Example tool: Echo (basic tool without sampling)
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

  // Example tool: Document Summarization (demonstrates sampling)
  if (config.SAMPLING_ENABLED && samplingContext) {
    server.registerTool(
      "summarize_document",
      {
        title: "Summarize Document",
        description:
          "Summarizes a document using AI with prompt injection protection. Demonstrates MCP sampling capabilities.",
        inputSchema: {
          content: z
            .string()
            .min(1)
            .describe("Document content to summarize"),
          bullet_points: z
            .number()
            .int()
            .min(1)
            .max(10)
            .optional()
            .describe("Number of bullet points (1-10, default: 3)"),
          format: z
            .enum(["bullets", "paragraph"])
            .optional()
            .describe("Output format (default: bullets)"),
        },
      },
      async (args) => {
        try {
          // Security: Use delimiter pattern to prevent prompt injection
          const formatInstruction =
            args.format === "paragraph"
              ? `${args.bullet_points || 3} concise sentences in a single paragraph`
              : `${args.bullet_points || 3} bullet points`;

          const safePrompt = createSafePrompt(
            "You are a document summarizer. Provide a clear, factual summary based only on the content provided.",
            args.content,
            `Summarize the above user input as ${formatInstruction}. Be concise and accurate.`,
          );

          logger.info("Initiating document summarization", {
            contentLength: args.content.length,
            bulletPoints: args.bullet_points || 3,
            format: args.format || "bullets",
          });

          const response = await samplingContext.sample({
            prompt: safePrompt,
            temperature: config.SAMPLING_TEMPERATURE_DEFAULT,
            max_tokens: config.SAMPLING_MAX_TOKENS_DEFAULT,
          });

          logger.info("Summarization completed", {
            responseLength: response.content.length,
            finishReason: response.finish_reason,
            model: response.model,
          });

          return createTextResult({
            summary: response.content,
            metadata: {
              format: args.format || "bullets",
              bullet_points: args.bullet_points || 3,
              model: response.model,
              finish_reason: response.finish_reason,
              tokens_used: response.usage?.total_tokens,
            },
          });
        } catch (error) {
          logger.error("Sampling failed", {
            error: error instanceof Error ? error.message : String(error),
            errorType: error instanceof Error ? error.constructor.name : typeof error,
          });

          // Handle specific sampling errors gracefully
          if (error instanceof SamplingNotSupportedError) {
            return createTextResult({
              error: "This client does not support AI sampling. Please use an MCP client that supports sampling capabilities.",
              error_code: "SAMPLING_NOT_SUPPORTED",
            });
          }

          if (error instanceof SamplingTimeoutError) {
            return createTextResult({
              error: `Sampling request timed out after ${error.timeout_ms}ms. Please try with shorter content.`,
              error_code: "SAMPLING_TIMEOUT",
            });
          }

          if (error instanceof SamplingError) {
            return createTextResult({
              error: `Sampling error: ${error.message}`,
              error_code: error.code || "SAMPLING_ERROR",
            });
          }

          // Re-throw unexpected errors
          throw error;
        }
      },
    );
  }

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
      if (config.SAMPLING_ENABLED) {
        capabilities.push("sampling");
      }
      res.json({
        name: config.SERVER_NAME,
        version: config.SERVER_VERSION,
        description: "TypeScript template for building MCP servers with sampling support",
        capabilities,
        sampling: config.SAMPLING_ENABLED
          ? {
              enabled: true,
              timeout_ms: config.SAMPLING_TIMEOUT_MS,
              max_tokens_default: config.SAMPLING_MAX_TOKENS_DEFAULT,
              temperature_default: config.SAMPLING_TEMPERATURE_DEFAULT,
            }
          : undefined,
      });
    }
  } catch (error) {
    logger.error("Error handling MCP request", {
      error: error instanceof Error ? error.message : error,
    });
    res.status(500).json({ error: "Internal server error" });
  }
};

// Handle MCP requests on /mcp endpoint
app.post("/mcp", mcpHandler);
app.get("/mcp", mcpHandler);

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
