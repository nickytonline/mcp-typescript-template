import { afterEach, describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  CallToolResultSchema,
  ElicitRequestSchema,
  LoggingMessageNotificationSchema,
  type ElicitResult,
} from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.ts";

type TestHarness = {
  client: Client;
  server: McpServer;
};

type SetupOptions = {
  /** Handles elicitation requests. If omitted, the client won't respond to them. */
  elicitHandler?: (request: { message: string }) => Promise<ElicitResult>;
  /** Whether the client advertises elicitation support. Defaults to true. */
  supportsElicitation?: boolean;
  /** Collects any logging notifications the server sends to the client. */
  onLog?: (params: { level: string; data: unknown; logger?: string }) => void;
};

let harness: TestHarness | undefined;

afterEach(async () => {
  if (harness) {
    await harness.server.close();
    await harness.client.close();
    harness = undefined;
  }
});

/**
 * Wires up an in-memory client/server pair for integration testing, exercising
 * the full MCP protocol stack in-process. A single helper covers every case:
 *   - pass an `elicitHandler` to answer elicitation requests
 *   - set `supportsElicitation: false` to test the unsupported-client path
 *   - pass `onLog` to capture outbound logging notifications
 */
async function setupClientServer(options: SetupOptions = {}) {
  const { elicitHandler, supportsElicitation = true, onLog } = options;

  const server = new McpServer(
    { name: "test-server", version: "0.0.0" },
    { capabilities: { logging: {} } },
  );
  registerTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: "test-client", version: "0.0.0" },
    { capabilities: supportsElicitation ? { elicitation: {} } : {} },
  );

  if (elicitHandler) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      return elicitHandler({ message: request.params.message });
    });
  }

  if (onLog) {
    client.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
      onLog(notification.params);
    });
  }

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  harness = { client, server };
  return harness;
}

function parseContent(result: unknown): Record<string, unknown> {
  const parsed = CallToolResultSchema.safeParse(result);
  expect(parsed.success).toBe(true);
  if (!parsed.success) {
    throw new Error("callTool result did not match CallToolResult schema");
  }
  const item = parsed.data.content[0];
  expect(item.type).toBe("text");
  if (item.type !== "text") {
    throw new Error("expected text content");
  }
  return JSON.parse(item.text);
}

describe("echo tool", () => {
  it("echoes back the provided message", async () => {
    const { client } = await setupClientServer();

    const result = await client.callTool({
      name: "echo",
      arguments: { message: "hello" },
    });

    const parsed = parseContent(result);
    expect(parsed.echo).toBe("hello");
    // Success results also carry structuredContent for outputSchema-aware clients.
    expect(result.structuredContent).toEqual({ echo: "hello" });
    expect(result.isError).toBeFalsy();
  });

  it("sends an MCP log notification to the client", async () => {
    const logs: Array<{ level: string; data: unknown; logger?: string }> = [];
    const { client } = await setupClientServer({ onLog: (params) => logs.push(params) });

    // Ask to receive debug-level notifications, then invoke the tool.
    await client.setLoggingLevel("debug");
    await client.callTool({ name: "echo", arguments: { message: "hi" } });

    const echoLog = logs.find((l) => l.logger === "echo");
    expect(echoLog).toBeDefined();
    expect(echoLog?.level).toBe("debug");
    expect(echoLog?.data).toEqual({ message: "hi" });
  });
});

describe("elicit_echo tool", () => {
  it("echoes the message the user provides via elicitation", async () => {
    const { client } = await setupClientServer({
      elicitHandler: async () => ({
        action: "accept",
        content: { message: "elicited hello" },
      }),
    });

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.echo).toBe("elicited hello");
    expect(result.structuredContent).toEqual({ echo: "elicited hello" });
    expect(result.isError).toBeFalsy();
  });

  it("returns a decline response (not an error) when the user declines", async () => {
    const { client } = await setupClientServer({
      elicitHandler: async () => ({ action: "decline" }),
    });

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.echo).toBeNull();
    expect(parsed.reason).toBe("User declined to provide a message");
    // A decline is a valid outcome, not a failure.
    expect(result.isError).toBeFalsy();
  });

  it("returns a cancel response (not an error) when the user cancels", async () => {
    const { client } = await setupClientServer({
      elicitHandler: async () => ({ action: "cancel" }),
    });

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.echo).toBeNull();
    expect(parsed.reason).toBe("Elicitation was cancelled");
    expect(result.isError).toBeFalsy();
  });

  it("returns an error result when accept is missing content", async () => {
    const { client } = await setupClientServer({
      elicitHandler: async () => ({ action: "accept" }),
    });

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.error).toBe("Accepted but no content was returned");
    expect(result.isError).toBe(true);
  });

  it("returns an error result when the client does not support elicitation", async () => {
    const { client } = await setupClientServer({ supportsElicitation: false });

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.error).toMatch(/elicitation/i);
    expect(result.isError).toBe(true);
  });
});
