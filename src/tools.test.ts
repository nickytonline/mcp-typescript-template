import { afterEach, describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema, ElicitRequestSchema, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.ts";

type TestHarness = {
  client: Client;
  server: McpServer;
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
 * Wires up an in-memory client/server pair for integration testing.
 * When an elicitHandler is provided, the client advertises elicitation
 * support and routes elicitation requests to it. When omitted, the
 * client still advertises elicitation support (so non-elicitation tools
 * can be tested) but does not handle elicitation requests.
 */
async function setupClientServer(elicitHandler?: (request: { message: string }) => Promise<ElicitResult>) {
  const server = new McpServer(
    { name: "test-server", version: "0.0.0" },
    { capabilities: { logging: {} } },
  );
  registerTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: "test-client", version: "0.0.0" },
    { capabilities: { elicitation: {} } },
  );

  if (elicitHandler) {
    client.setRequestHandler(ElicitRequestSchema, async (request) => {
      return elicitHandler({ message: request.params.message });
    });
  }

  await server.connect(serverTransport);
  await client.connect(clientTransport);

  harness = { client, server };
  return harness;
}

/**
 * Like setupClientServer but the client does NOT advertise elicitation
 * support, so server.server.elicitInput() will throw.
 */
async function setupClientServerWithoutElicitation() {
  const server = new McpServer(
    { name: "test-server", version: "0.0.0" },
    { capabilities: { logging: {} } },
  );
  registerTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: "test-client", version: "0.0.0" },
    { capabilities: {} },
  );

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
  });
});

describe("elicit_echo tool", () => {
  it("echoes the message the user provides via elicitation", async () => {
    const { client } = await setupClientServer(async () => ({
      action: "accept",
      content: { message: "elicited hello" },
    }));

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.echo).toBe("elicited hello");
  });

  it("returns a decline response when the user declines", async () => {
    const { client } = await setupClientServer(async () => ({
      action: "decline",
    }));

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.echo).toBeNull();
    expect(parsed.reason).toBe("User declined to provide a message");
  });

  it("returns a cancel response when the user cancels", async () => {
    const { client } = await setupClientServer(async () => ({
      action: "cancel",
    }));

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.echo).toBeNull();
    expect(parsed.reason).toBe("Elicitation was cancelled");
  });

  it("returns an error when accept is missing content", async () => {
    const { client } = await setupClientServer(async () => ({
      action: "accept",
    }));

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.error).toBe("Accepted but no content was returned");
  });

  it("returns an error when the client does not support elicitation", async () => {
    const { client } = await setupClientServerWithoutElicitation();

    const result = await client.callTool({
      name: "elicit_echo",
      arguments: {},
    });

    const parsed = parseContent(result);
    expect(parsed.error).toMatch(/elicitation/i);
  });
});
