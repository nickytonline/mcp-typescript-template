import { afterEach, describe, it, expect } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import {
  McpServer,
  InMemoryTransport,
  createMcpHandler,
  type CallToolResult,
  type ElicitRequest,
  type ElicitResult,
} from "@modelcontextprotocol/server";
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
 * the full MCP protocol stack in-process. A bare `Protocol.connect()` (no HTTP
 * layer) negotiates the legacy 2025 handshake by default, so this harness
 * exercises `elicit_echo` over that era. Its handler code (`inputRequired()` /
 * `ctx.mcpReq.inputResponses`) is era-agnostic — the SDK translates the same
 * calls into whichever wire representation the connection negotiated — so
 * this is still a real test of the tool logic; see the "modern era" describe
 * block below for an end-to-end test of the 2026-07-28 multi-round-trip wire
 * path through the actual `createMcpHandler` production entry point.
 *
 * A single helper covers every case:
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
    client.setRequestHandler("elicitation/create", async (request: ElicitRequest) => {
      return elicitHandler({ message: request.params.message });
    });
  }

  if (onLog) {
    client.fallbackNotificationHandler = async (notification) => {
      if (notification.method === "notifications/message") {
        onLog(notification.params as { level: string; data: unknown; logger?: string });
      }
    };
  }

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  harness = { client, server };
  return harness;
}

function parseContent(result: CallToolResult): Record<string, unknown> {
  const item = result.content[0];
  expect(item?.type).toBe("text");
  if (item?.type !== "text") {
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

    // The SDK itself rejects the embedded elicitation request before our
    // handler's inputResponse() ever sees a retry — it never reaches our own
    // createErrorResult, so the message here is SDK-formatted, not ours.
    const item = result.content[0];
    expect(item?.type).toBe("text");
    if (item?.type === "text") {
      expect(item.text).toMatch(/elicitation/i);
    }
    expect(result.isError).toBe(true);
  });
});

describe("elicit_echo tool (2026-07-28 modern era)", () => {
  /**
   * The in-memory harness above negotiates the legacy 2025 handshake by
   * default. These tests instead go through `createMcpHandler` — the actual
   * production entry point wired up in src/index.ts — via a
   * `StreamableHTTPClientTransport` whose `fetch` is bridged directly to the
   * handler in-process (no real network), with the client pinned to the
   * 2026-07-28 era. This confirms the multi-round-trip
   * (`inputRequired`/`inputResponses`) path actually works end-to-end on the
   * wire format this migration introduces, not just against the tool
   * function in isolation.
   */
  async function setupModernEraClient(options: { supportsElicitation?: boolean } = {}) {
    const { supportsElicitation = true } = options;

    const server = new McpServer(
      { name: "test-server", version: "0.0.0" },
      { capabilities: { logging: {} } },
    );
    registerTools(server);

    const handler = createMcpHandler(() => server);
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost/mcp"), {
      fetch: async (input, init) => handler.fetch(new Request(input, init)),
    });

    const client = new Client(
      { name: "test-client", version: "0.0.0" },
      {
        capabilities: supportsElicitation ? { elicitation: {} } : {},
        versionNegotiation: { mode: { pin: "2026-07-28" } },
      },
    );

    await client.connect(transport);
    expect(client.getProtocolEra()).toBe("modern");

    return { client, handler };
  }

  it("echoes the message the user provides via elicitation", async () => {
    const { client, handler } = await setupModernEraClient();
    client.setRequestHandler("elicitation/create", async () => ({
      action: "accept",
      content: { message: "modern era hello" },
    }));

    const result = await client.callTool({ name: "elicit_echo", arguments: {} });

    const parsed = parseContent(result);
    expect(parsed.echo).toBe("modern era hello");
    expect(result.isError).toBeFalsy();

    await client.close();
    await handler.close();
  });

  it("returns an error result when the client does not support elicitation", async () => {
    const { client, handler } = await setupModernEraClient({ supportsElicitation: false });

    await expect(client.callTool({ name: "elicit_echo", arguments: {} })).rejects.toThrow(/elicitation/i);

    await client.close();
    await handler.close();
  });
});
