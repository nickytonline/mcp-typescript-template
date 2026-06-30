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
| Tool registration | `src/index.ts` inside the `getServer()` function |
| Response formatting | `createTextResult()` from `src/lib/utils.ts` |
| Input validation | Zod schemas defined inline in `server.registerTool()` |
| Tests | `src/lib/<tool-name>.test.ts` (colocated with logic, or alongside the tool) |

The `getServer()` function is called once per MCP session, so each session gets its own isolated `McpServer` instance. All tools must be registered inside it.

---

## Step 1: Name the Tool

Tool names should use `snake_case` — this is the prevailing community convention (e.g. `get_user`, `search_documents`, `list_items`). The MCP spec ([SEP-986](https://modelcontextprotocol.io/seps/986-specify-format-for-tool-names)) allows `a-z`, `A-Z`, `0-9`, `_`, `-`, `.`, and `/`, but does not mandate a style. Names must be 1–64 characters and unique within the server.

The tool's `description` and every Zod field's `.describe()` are how LLM clients decide *when* and *how* to call the tool — write them as if you're explaining the tool to someone who has never seen the codebase.

---

## Step 2: Register the Tool

Open `src/index.ts` and add a `server.registerTool()` call inside `getServer()`, following the pattern of the existing `echo` tool:

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
  },
  async (args) => {
    logger.info("Tool invoked", { toolName: "my_tool", args });

    // Your tool logic here
    const result = {
      output: args.query,
      count: 1,
    };

    return createTextResult(result);
  },
);
```

Key points:
- `inputSchema` takes an object of Zod field definitions (not a full `z.object()` — just the shape)
- Always return `createTextResult(data)` for text responses
- Log tool invocations with `logger.info` and errors with `logger.error`
- For non-trivial logic, extract it into a helper function in `src/lib/<tool-name>.ts` and import it — this keeps `getServer()` readable and makes unit testing easier

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

Return errors in MCP format rather than throwing:

```typescript
async (args) => {
  logger.info("Tool invoked", { toolName: "my_tool", args });

  try {
    const result = await doSomething(args.query);
    return createTextResult(result);
  } catch (error) {
    logger.error("Tool execution failed", {
      toolName: "my_tool",
      error: error instanceof Error ? error.message : error,
    });
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : "Unknown error"}` }],
      isError: true,
    };
  }
},
```

---

## Step 4: Write Tests

Add a test file at `src/lib/<tool-name>.test.ts`. Follow the pattern in `src/lib/utils.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

describe("my_tool", () => {
  it("should return the expected output", () => {
    // Test your tool's core logic directly (extract it into a helper function if needed)
    const result = { output: "hello", count: 1 };
    expect(result.output).toBe("hello");
  });
});
```

Run tests with:

```bash
npm run test
```

---

## Step 5: Check the Conformance Baseline

If the tool or capability you just implemented is covered by a skipped conformance test, remove the corresponding entry from `conformance-baseline.yml`. Stale entries cause CI to fail, and removing them re-enables the test.

The baseline currently skips entries in these categories:

- **Tool response content types** — `tools-call-image`, `tools-call-audio`, `tools-call-embedded-resource`, `tools-call-mixed-content`, `tools-call-with-logging`, `tools-call-with-progress`, `tools-call-sampling`
- **Resources** — `resources-list`, `resources-read-text`, `resources-read-binary`, `resources-templates-read`, `resources-subscribe`, `resources-unsubscribe`
- **Prompts** — `prompts-list`, `prompts-get-simple`, `prompts-get-with-args`, `prompts-get-embedded-resource`, `prompts-get-with-image`
- **Other** — `completion-complete`, `tools-call-elicitation`, `elicitation-sep1034-defaults`, `elicitation-sep1330-enums`, `dns-rebinding-protection`

Check `conformance-baseline.yml` for the current full list — it may have been updated since this skill was written. Remove only the entries that your implementation actually satisfies.

> **Important:** If you have already started the container at least once, you must force-recreate it after rebuilding — otherwise the old image is reused and the test will appear to fail even though the implementation is correct:
>
> ```bash
> docker compose up -d --force-recreate --wait --wait-timeout 60
> ```

---

## Step 6: Verify

```bash
npm run build        # compile TypeScript
npm run lint         # ESLint
npm run format:check # Prettier formatting check
npm run test         # Vitest unit tests
npm run dev          # start server with hot reload for manual testing
```

To test the tool interactively, connect an MCP client to `http://localhost:3000/mcp` after starting the dev server.
