import { createServer, type Server as HttpServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createApp } from "./app.ts";

type AppHarness = {
  httpServer: HttpServer;
  handler: ReturnType<typeof createApp>["handler"];
  baseUrl: string;
  client?: Client;
};

let harness: AppHarness | undefined;

afterEach(async () => {
  if (!harness) return;

  if (harness.client) {
    await harness.client.close();
  }
  await harness.handler.close();
  await closeHttpServer(harness.httpServer);
  harness = undefined;
});

function closeHttpServer(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function setupHttpServer() {
  const { app, handler } = createApp();
  const httpServer = createServer(app);

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("expected the HTTP server to have a TCP address");
  }

  harness = {
    httpServer,
    handler,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
  return harness;
}

async function setupHttpClient() {
  const appHarness = await setupHttpServer();
  const client = new Client(
    { name: "test-client", version: "0.0.0" },
    {},
  );
  const transport = new StreamableHTTPClientTransport(
    new URL(`${appHarness.baseUrl}/mcp`),
  );

  await client.connect(transport);
  appHarness.client = client;
  return { ...appHarness, client };
}

describe("HTTP app", () => {
  it("serves the health endpoint through Express", async () => {
    const { baseUrl } = await setupHttpServer();

    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("serves MCP requests through Express and the Node adapter", async () => {
    const { client } = await setupHttpClient();

    const result = await client.callTool({
      name: "echo",
      arguments: { message: "over HTTP" },
    });

    expect(result.structuredContent).toEqual({ echo: "over HTTP" });
    expect(result.isError).toBeFalsy();
  });

  it("returns a client error for malformed JSON", async () => {
    const { baseUrl } = await setupHttpServer();

    const response = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect(response.status).toBe(400);
  });
});
