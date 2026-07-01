import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ElicitRequestFormParams, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createTextResult } from "./lib/utils.ts";
import { logger } from "./logger.ts";

type ElicitInputFn = (params: ElicitRequestFormParams) => Promise<ElicitResult>;
type SendLoggingMessageFn = (params: {
  level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
  data: unknown;
  logger?: string;
}) => Promise<void>;

/**
 * Registers all MCP tools on the server.
 * Called once per session from getServer() in src/index.ts.
 */
export function registerTools(server: McpServer): void {
  server.registerTool(
    "elicit_echo",
    {
      title: "Elicit Echo",
      description: "Ask the user what they want to echo back, then echoes it",
    },
    (extra) => elicitEcho(server.server.elicitInput.bind(server.server), extra),
  );

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echo back the provided message",
      inputSchema: {
        message: z.string().describe("The message to echo back"),
      },
    },
    (args, extra) => echo(server.sendLoggingMessage.bind(server), args, extra),
  );
}

/**
 * Asks the user what they want to echo via MCP elicitation, then echoes it back.
 * Handles all three elicitation outcomes: accept, decline, and cancel.
 */
async function elicitEcho(
  elicitInput: ElicitInputFn,
  extra: { sessionId?: string; requestId: unknown },
): Promise<CallToolResult> {
  const toolName = "elicit_echo";
  const { sessionId, requestId } = extra;
  try {
    const result = await elicitInput({
      message: "What would you like to echo?",
      requestedSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            title: "Message",
            description: "The message to echo back",
          },
        },
        required: ["message"],
      },
    });

    if (result.action === "accept") {
      if (!result.content) {
        logger.warn({ toolName, sessionId, requestId }, "Accept response missing content");
        return createTextResult({ error: "Accepted but no content was returned" });
      }
      const data = { echo: result.content.message };
      logger.info({ toolName, sessionId, requestId }, "Tool executed");
      return createTextResult(data);
    }

    if (result.action === "decline") {
      logger.info({ toolName, sessionId, requestId, action: "decline" }, "User declined elicitation");
      return createTextResult({ echo: null, reason: "User declined to provide a message" });
    }

    logger.info({ toolName, sessionId, requestId, action: "cancel" }, "User cancelled elicitation");
    return createTextResult({ echo: null, reason: "Elicitation was cancelled" });
  } catch (error) {
    logger.error(
      { toolName, sessionId, requestId, error: error instanceof Error ? error.message : String(error) },
      "Tool execution failed",
    );
    return createTextResult({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Echoes back the provided message. Also sends a debug log notification
 * to the client as a demonstration of MCP logging.
 */
async function echo(
  sendLoggingMessage: SendLoggingMessageFn,
  args: { message: string },
  extra: { sessionId?: string; requestId: unknown },
): Promise<CallToolResult> {
  const toolName = "echo";
  const { sessionId, requestId } = extra;
  // Example: send an MCP log notification to the client. The client
  // controls which levels it receives via logging/setLevel.
  // See: https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/logging
  try {
    await sendLoggingMessage({
      level: "debug",
      data: { message: args.message },
      logger: "echo",
    });
  } catch (error) {
    // Log notification failures must not prevent the tool from responding.
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to send MCP log notification",
    );
  }

  const data = { echo: args.message };
  logger.info({ toolName, sessionId, requestId }, "Tool executed");
  return createTextResult(data);
}
