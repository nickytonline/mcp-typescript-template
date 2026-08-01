import type { McpServer, CallToolResult, InputRequiredResult, ServerContext } from "@modelcontextprotocol/server";
import { inputRequired, inputResponse } from "@modelcontextprotocol/server";
import { z } from "zod";
import { createErrorResult, createTextResult } from "./lib/utils.ts";
import { logger } from "./logger.ts";

type SendLoggingMessageFn = (params: {
  level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
  data: unknown;
  logger?: string;
}) => Promise<void>;

const ELICIT_ECHO_MESSAGE_KEY = "message";

/**
 * Registers all MCP tools on the server.
 * Called once per request from getServer() in src/index.ts (the 2026-07-28
 * spec serves each request from a fresh instance — there is no per-connection
 * session to register tools once for).
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
      outputSchema: z.object({
        echo: z.string().nullable().describe("The echoed message, or null if none was provided"),
        reason: z.string().optional().describe("Why no message was echoed, when applicable"),
      }),
      // Annotations are untrusted hints clients use for UX/safety. This tool
      // neither mutates state nor touches the outside world.
      // https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (ctx) => elicitEcho(ctx),
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
      inputSchema: z.object({
        message: z.string().describe("The message to echo back"),
      }),
      outputSchema: z.object({
        echo: z.string().describe("The echoed message"),
      }),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) => echo(server.sendLoggingMessage.bind(server), args, ctx),
  );
}

/**
 * Asks the user what they want to echo via MCP elicitation, then echoes it
 * back. This is a multi-round-trip tool (protocol revision 2026-07-28): the
 * first call has no `inputResponses` yet, so it returns an `inputRequired()`
 * result carrying the embedded elicitation request. The client resolves that
 * and retries the same tool call with the response attached — this handler
 * runs again and reads it via `ctx.mcpReq.inputResponses` to produce the
 * final result. (The older push-style `elicitInput()` call throws on a
 * 2026-07-28-era request, which is why this can't be a single synchronous
 * await like it was under the previous stateful spec.)
 */
function elicitEcho(ctx: ServerContext): CallToolResult | InputRequiredResult {
  const toolName = "elicit_echo";
  const requestId = ctx.mcpReq.id;
  const response = inputResponse(ctx.mcpReq.inputResponses, ELICIT_ECHO_MESSAGE_KEY);

  if (response.kind === "missing") {
    return inputRequired({
      inputRequests: {
        [ELICIT_ECHO_MESSAGE_KEY]: inputRequired.elicit({
          message: "What would you like to echo?",
          // Elicitation `requestedSchema` must be a hand-written, flat JSON
          // Schema (the restricted subset the MCP spec allows: primitive
          // properties only, no nesting).
          // https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation#request-schema
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
        }),
      },
    });
  }

  // Decline and cancel are valid user outcomes, not errors — return them as
  // normal results (no isError) so the model treats them as a real answer.
  if (response.kind !== "elicit") {
    logger.error({ toolName, requestId, kind: response.kind }, "Tool execution failed");
    return createErrorResult({ error: "Expected an elicitation response" });
  }

  if (response.action === "decline") {
    logger.info({ toolName, requestId, action: "decline" }, "User declined elicitation");
    return createTextResult({ echo: null, reason: "User declined to provide a message" });
  }

  if (response.action === "cancel") {
    logger.info({ toolName, requestId, action: "cancel" }, "User cancelled elicitation");
    return createTextResult({ echo: null, reason: "Elicitation was cancelled" });
  }

  const accepted = z.object({ message: z.string() }).safeParse(response.content);
  if (!accepted.success) {
    logger.warn({ toolName, requestId }, "Accept response missing content");
    return createErrorResult({ error: "Accepted but no content was returned" });
  }

  logger.info({ toolName, requestId }, "Tool executed");
  return createTextResult({ echo: accepted.data.message });
}

/**
 * Echoes back the provided message. Also sends a debug log notification
 * to the client as a demonstration of MCP logging.
 */
async function echo(
  sendLoggingMessage: SendLoggingMessageFn,
  args: { message: string },
  ctx: ServerContext,
): Promise<CallToolResult> {
  const toolName = "echo";
  const requestId = ctx.mcpReq.id;
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
  logger.info({ toolName, requestId }, "Tool executed");
  return createTextResult(data);
}
