---
name: create-mcp-tool
description: Add a new MCP tool to this server template. Use when asked to "add a tool", "add an MCP tool", "create a new tool", or "implement a new tool".
metadata:
  author: nickytonline
  version: "1.0.0"
---

# Add an MCP Tool to This Template

This skill walks you through adding a new tool to the MCP server. If you need to reference MCP SDK types, capabilities, or advanced patterns not covered here, use the context7 MCP server or WebFetch to look up the [`@modelcontextprotocol/sdk` documentation](https://github.com/modelcontextprotocol/typescript-sdk).

---

## Template Conventions

| Concern | Location |
|---|---|
| Tool registration | `src/tools.ts` inside `registerTools(server)` via `server.registerTool()` |
| Tool logic | `src/tools.ts` — functions that take only the dependencies they need |
| Response formatting | `createTextResult()` / `createErrorResult()` from `src/lib/utils.ts` |
| Input validation | Zod `inputSchema` defined inline in `server.registerTool()` |
| Typed output | `outputSchema` + `structuredContent` (emitted automatically by `createTextResult`) |
| Tests | `src/tools.test.ts` (colocated with `src/tools.ts`) |

Everything for a tool lives in `src/tools.ts`. `registerTools(server)` is the single source of truth for tool wiring — it's called from `getServer()` in `src/index.ts` **and** reused by the tests, so registration can never drift from what's tested. Each tool's implementation is a function that takes only the dependencies it needs (e.g. the bound `elicitInput` function, `sendLoggingMessage`, and the `extra` object), which keeps it small and easy to drive through every branch. `index.ts` owns only HTTP routing and session lifecycle; each session gets its own isolated `McpServer` instance.

---

## Step 1: Name the Tool

Tool names should use `snake_case` — this is the prevailing community convention (e.g. `get_user`, `search_documents`, `list_items`). The MCP spec ([SEP-986](https://modelcontextprotocol.io/seps/986-specify-format-for-tool-names)) allows `a-z`, `A-Z`, `0-9`, `_`, `-`, `.`, and `/`, but does not mandate a style. Names must be 1–64 characters and unique within the server.

The tool's `description` and every Zod field's `.describe()` are how LLM clients decide *when* and *how* to call the tool — write them as if you're explaining the tool to someone who has never seen the codebase.

---

## Step 2: Register the Tool

Open `src/tools.ts` and add a `server.registerTool(...)` call inside `registerTools`, following the pattern of the existing `echo` tool:

```typescript
server.registerTool(
  "my_tool",
  {
    title: "My Tool",
    description: "A clear, specific description of what this tool does and when to use it",
    inputSchema: {
      query: z.string().describe("The input to process — be specific about format or constraints"),
      limit: z.number().int().min(1).max(100).optional().describe("Maximum number of results to return (default: 10)"),
    },
    // Declare the shape of a successful result so clients can consume
    // structuredContent (createTextResult emits it automatically).
    outputSchema: {
      output: z.string().describe("The processed output"),
      count: z.number().describe("Number of results"),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  (args, extra) => myTool(args, extra),
);
```

Then implement `myTool` as a function lower in the file:

```typescript
async function myTool(
  args: { query: string; limit?: number },
  extra: { sessionId?: string; requestId: unknown },
): Promise<CallToolResult> {
  const toolName = "my_tool";
  const { sessionId, requestId } = extra;

  const result = { output: args.query, count: 1 };
  logger.info({ toolName, sessionId, requestId }, "Tool executed");
  return createTextResult(result);
}
```

Key points:
- `inputSchema` / `outputSchema` take an object of Zod field definitions (not a full `z.object()` — just the shape)
- Return `createTextResult(data)` on success — it emits both a text block and `structuredContent` for `outputSchema`-aware clients ([structured content](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#structured-content))
- Keep the tool's logic in a function that receives only the dependencies it needs (e.g. `elicitInput`, `sendLoggingMessage`, `extra`); pass them from the registration callback with `.bind()` where needed. This keeps each tool small and testable
- Log tool execution with `logger.info` and failures with `logger.error`, including `sessionId` and `requestId` from `extra` for traceability

### Tool Annotations

Add an `annotations` field to signal the tool's safety profile to LLM clients. All fields are optional booleans — only set the ones that differ from the defaults:

| Annotation | Default | When to set |
|---|---|---|
| `readOnlyHint` | `false` | `true` if the tool only reads data and never modifies anything |
| `destructiveHint` | `true` | `false` if writes are additive only (e.g. create/append, never delete) — only meaningful when `readOnlyHint: false` |
| `idempotentHint` | `false` | `true` if calling repeatedly with the same args has no additional effect — only meaningful when `readOnlyHint: false` |
| `openWorldHint` | `true` | `false` if the tool operates on a closed, known domain (e.g. reads only from local config) |

```typescript
server.registerTool(
  "my_tool",
  {
    title: "My Tool",
    description: "...",
    inputSchema: { /* ... */ },
    annotations: {
      readOnlyHint: true,    // this tool only reads, never writes
      openWorldHint: false,  // operates on a closed local domain
    },
  },
  async (args) => { /* ... */ },
);
```

---

## Step 3: Handle Errors

Report execution failures in-band with `createErrorResult` (which sets `isError: true`) rather than throwing — this lets the client/model distinguish a failure from a normal result. Reserve `isError` for genuine failures; valid outcomes (e.g. a user declining an elicitation, or an empty search) are normal results via `createTextResult`. See [Error Handling](https://modelcontextprotocol.io/specification/2025-06-18/server/tools#error-handling) in the spec.

```typescript
async function myTool(args, extra) {
  const toolName = "my_tool";
  const { sessionId, requestId } = extra;

  try {
    const result = await doSomething(args.query);
    logger.info({ toolName, sessionId, requestId }, "Tool executed");
    return createTextResult(result);
  } catch (error) {
    logger.error(
      { toolName, sessionId, requestId, error: error instanceof Error ? error.message : String(error) },
      "Tool execution failed",
    );
    return createErrorResult({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

---

## Step 4: Write Tests

Add tests to `src/tools.test.ts`, colocated with `src/tools.ts`. Tests use `InMemoryTransport` to wire up a real client/server pair in-process, exercising the full MCP protocol stack (tool registration, request/response, elicitation) with only the user-facing parts mocked.

Follow the existing pattern:

```typescript
import { afterEach, describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "./tools.ts";

let harness: { client: Client; server: McpServer } | undefined;

afterEach(async () => {
  if (harness) {
    await harness.server.close();
    await harness.client.close();
    harness = undefined;
  }
});

async function setupClientServer() {
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

describe("my_tool", () => {
  it("returns the expected output", async () => {
    const { client } = await setupClientServer();

    const result = await client.callTool({
      name: "my_tool",
      arguments: { query: "hello" },
    });

    const parsed = parseContent(result);
    expect(parsed.output).toBe("hello");
  });
});
```

Key points:
- Use `InMemoryTransport.createLinkedPair()` to connect a real `Client` and `McpServer` in-process — no HTTP server needed
- Connect the server before the client (`server.connect` then `client.connect`) so the initialize handshake completes
- Use `afterEach` to close both sides leak-safely, even if assertions fail
- The existing `setupClientServer` takes an options object — pass `elicitHandler` to answer elicitation, `supportsElicitation: false` to test the unsupported-client path, and `onLog` to capture outbound logging notifications. Reuse it rather than adding new helpers
- Use `CallToolResultSchema.safeParse()` to validate and narrow the `callTool` return type before asserting on content
- Assert `result.structuredContent` for `outputSchema`-aware output, and `result.isError` to confirm failures are flagged (and that valid outcomes are *not*)

Run tests with:

```bash
npm run test
```

---

## Step 5: Verify

```bash
npm run build        # compile TypeScript
npm run lint         # ESLint
npm run format:check # Prettier formatting check
npm run test:ci      # Vitest (non-interactive, outputs test-results.json)
npm run dev          # start server with hot reload for manual testing
```

To test the tool interactively, connect an MCP client to `http://localhost:3000/mcp` after starting the dev server.
