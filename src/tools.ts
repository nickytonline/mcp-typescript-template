import type {
  CallToolResult,
  InputRequiredResult,
  McpServer,
  ServerContext,
} from "@modelcontextprotocol/server";
import { inputRequired, inputResponse } from "@modelcontextprotocol/server";
import { Effect, Either, ParseResult, Schema } from "effect";
import { toMcpSchema } from "./lib/mcp-schema.ts";
import { createErrorResult, createTextResult, runMcpEffect } from "./lib/utils.ts";
import { logger } from "./logger.ts";

type SendLoggingMessageFn = (params: {
  level: "debug" | "info" | "notice" | "warning" | "error" | "critical" | "alert" | "emergency";
  data: unknown;
  logger?: string;
}) => Promise<void>;

const ELICIT_ECHO_MESSAGE_KEY = "message";

const ElicitEchoOutputSchema = toMcpSchema(
  Schema.Struct({
    echo: Schema.NullOr(Schema.String).annotations({
      description: "The echoed message, or null if none was provided",
    }),
    reason: Schema.optional(
      Schema.String.annotations({
        description: "Why no message was echoed, when applicable",
      }),
    ),
  }),
);

const EchoInputSchema = toMcpSchema(
  Schema.Struct({
    message: Schema.String.annotations({ description: "The message to echo back" }),
  }),
);

const EchoOutputSchema = toMcpSchema(
  Schema.Struct({
    echo: Schema.String.annotations({ description: "The echoed message" }),
  }),
);

const AcceptedElicitationSchema = Schema.Struct({
  message: Schema.String,
});

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
      outputSchema: ElicitEchoOutputSchema,
      // Annotations are untrusted hints clients use for UX/safety. This tool
      // neither mutates state nor touches the outside world.
      // https://modelcontextprotocol.io/specification/2025-06-18/server/tools#tool
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (ctx) => runMcpEffect(elicitEcho(ctx)),
  );

  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "Echo back the provided message",
      inputSchema: EchoInputSchema,
      outputSchema: EchoOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args, ctx) => runMcpEffect(echo(server.sendLoggingMessage.bind(server), args, ctx)),
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
function elicitEcho(
  ctx: ServerContext,
): Effect.Effect<CallToolResult | InputRequiredResult> {
  return Effect.gen(function* () {
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
      yield* logger.error(
        { toolName, requestId, kind: response.kind },
        "Tool execution failed",
      );
      return createErrorResult({ error: "Expected an elicitation response" });
    }

    if (response.action === "decline") {
      yield* logger.info(
        { toolName, requestId, action: "decline" },
        "User declined elicitation",
      );
      return createTextResult({ echo: null, reason: "User declined to provide a message" });
    }

    if (response.action === "cancel") {
      yield* logger.info(
        { toolName, requestId, action: "cancel" },
        "User cancelled elicitation",
      );
      return createTextResult({ echo: null, reason: "Elicitation was cancelled" });
    }

    const accepted = ParseResult.decodeUnknownEither(AcceptedElicitationSchema)(
      response.content,
    );
    if (Either.isLeft(accepted)) {
      yield* logger.warn(
        { toolName, requestId },
        "Accept response missing content",
      );
      return createErrorResult({ error: "Accepted but no content was returned" });
    }

    yield* logger.info({ toolName, requestId }, "Tool executed");
    return createTextResult({ echo: accepted.right.message });
  });
}

/**
 * Echoes back the provided message. Also sends a debug log notification
 * to the client as a demonstration of MCP logging.
 */
function echo(
  sendLoggingMessage: SendLoggingMessageFn,
  args: { message: string },
  ctx: ServerContext,
): Effect.Effect<CallToolResult> {
  return Effect.gen(function* () {
    const toolName = "echo";
    const requestId = ctx.mcpReq.id;
    // Example: send an MCP log notification to the client. The client
    // controls which levels it receives via logging/setLevel.
    // See: https://modelcontextprotocol.io/specification/2025-06-18/server/utilities/logging
    yield* Effect.tryPromise({
      try: () =>
        sendLoggingMessage({
          level: "debug",
          data: { message: args.message },
          logger: "echo",
        }),
      catch: (error) => error,
    }).pipe(
      // Log notification failures must not prevent the tool from responding.
      Effect.catchAll((error) =>
        logger.debug(
          { error: error instanceof Error ? error.message : String(error) },
          "Failed to send MCP log notification",
        ),
      ),
    );

    const data = { echo: args.message };
    yield* logger.info({ toolName, requestId }, "Tool executed");
    return createTextResult(data);
  });
}
