import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ElicitRequestFormParams, ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { createErrorResult, createTextResult } from "./lib/utils.ts";
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
      // `outputSchema` lets clients validate and consume `structuredContent`
      // (see createTextResult). The echo may be null when the user declines or
      // cancels, so `echo` is nullable and not required.
      // https://modelcontextprotocol.io/specification/2025-06-18/server/tools#output-schema
      outputSchema: {
        echo: z.string().nullable().describe("The echoed message, or null if none was provided"),
        reason: z.string().optional().describe("Why no message was echoed, when applicable"),
      },
      // Annotations are untrusted hints clients use for UX/safety. This tool
      // neither mutates state nor touches the outside world.
      // https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (extra) => elicitEcho(server.server.elicitInput.bind(server.server), extra),
  );

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echo back the provided message",
      // Tool *input* is declared with a Zod schema — the SDK compiles it to
      // JSON Schema and validates incoming args for us. (Contrast with the
      // elicitation `requestedSchema` in elicitEcho, which must be hand-written
      // JSON Schema; see the comment there.)
      inputSchema: {
        message: z.string().describe("The message to echo back"),
      },
      outputSchema: {
        echo: z.string().describe("The echoed message"),
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
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
    // Elicitation `requestedSchema` must be a hand-written, flat JSON Schema
    // (the restricted subset the MCP spec allows: primitive properties only,
    // no nesting). This is why we don't reuse a Zod schema here the way `echo`
    // does for its inputSchema — elicitation intentionally accepts only this
    // limited shape so clients can render a simple form.
    // https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation#request-schema
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
        // A genuine failure: the client claimed acceptance but sent nothing.
        return createErrorResult({ error: "Accepted but no content was returned" });
      }
      const data = { echo: result.content.message };
      logger.info({ toolName, sessionId, requestId }, "Tool executed");
      return createTextResult(data);
    }

    // Decline and cancel are valid user outcomes, not errors — return them as
    // normal results (no isError) so the model treats them as a real answer.
    if (result.action === "decline") {
      logger.info({ toolName, sessionId, requestId, action: "decline" }, "User declined elicitation");
      return createTextResult({ echo: null, reason: "User declined to provide a message" });
    }

    logger.info({ toolName, sessionId, requestId, action: "cancel" }, "User cancelled elicitation");
    return createTextResult({ echo: null, reason: "Elicitation was cancelled" });
  } catch (error) {
    // Reaching here means elicitation itself failed (e.g. the client doesn't
    // support it) — a genuine execution error.
    logger.error(
      { toolName, sessionId, requestId, error: error instanceof Error ? error.message : String(error) },
      "Tool execution failed",
    );
    return createErrorResult({
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
