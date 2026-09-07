# MCP TypeScript Template

A TypeScript template for building remote Model Context Protocol (MCP) servers with modern tooling and best practices while leveraging the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Features

This template provides:

- **TypeScript 7** - Native compiler with strict configuration; TypeScript 6 remains available for `typescript-eslint`'s compiler API
- **Effect** - Typed configuration, validation, logging, error handling, and async workflows
- **Vite** - Fast build system with ES modules output
- **Express** - Fast, unopinionated web framework for HTTP server
- **ESLint + Prettier** - Code quality and formatting
- **Docker** - Containerization support
- **Example Tools** - `echo` and `elicit_echo` tools demonstrating tool implementation, structured output, annotations, and MCP elicitation

## Getting Started

The easiest way to get started is using `degit`:

1. **Create a new project from this template**

   ```bash
   npx degit nickytonline/mcp-typescript-template my-mcp-server
   cd my-mcp-server
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Start the server**
   ```bash
   npm start
   ```

The server will be available at `http://localhost:3000` for MCP connections.

### Alternative: Using GitHub Template

You can also click the "Use this template" button on GitHub to create a new repository, then clone it:

```bash
git clone <your-repo-url>
cd my-mcp-server
npm install
```

## Development

### Type checking

`npm run typecheck` uses the TypeScript 7 compiler. The `typescript` package is an npm alias for the TypeScript 6 compatibility package because `typescript-eslint` still depends on TypeScript's legacy compiler API; the compatibility package is available as `tsc6` when needed.

### Watch mode for development (with hot reloading)

```bash
npm run dev
```

### Build the project

```bash
npm run build
```

### Linting

- Lint the project

```bash
npm run lint
```

- Fix all auto-fixable lint errors

```bash
npm run lint:fix
```

### Formatting

- Format files in the project

```bash
npm run format
```

- Check formatting

```bash
npm run format:check
```

## Testing Your MCP Server

You can test your MCP server using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector
```

This will launch a web interface that allows you to:
- Connect to your MCP server
- Test your tools interactively
- View request/response messages
- Debug your MCP implementation

Make sure your server is running (using `npm start` or `npm run dev`) before connecting with the inspector.

## Available Tools

The template includes two example tools:

### echo

Echoes back the provided message - a simple example to demonstrate MCP tool implementation.

**Parameters:**

- `message` (string) - The message to echo back

### elicit_echo

Demonstrates [MCP elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation): the tool takes no input, asks the connected client to prompt the user for a message, then echoes it back. Handles all three elicitation outcomes (accept, decline, cancel) and errors when the client doesn't support elicitation.

Both tools declare an `outputSchema` and return `structuredContent` alongside the text result, and carry `annotations` (`readOnlyHint`, `idempotentHint`, `openWorldHint`) describing their safety profile.

## Customizing Your MCP Server

1. **Update package.json** - Change name, description, and keywords
2. **Modify src/tools.ts** - Replace the `echo` / `elicit_echo` tools with your custom tools
3. **Add your logic** - Create additional TypeScript files for your business logic
4. **Update README** - Document your specific MCP server functionality

## Docker

Build and run using Docker:

- Build the Docker image

```bash
docker build -t my-mcp-server .
```

- Run the container

```bash
docker run -p 3000:3000 my-mcp-server
```

### Docker Compose

A `docker-compose.yml` is included with a health check pre-configured:

```bash
docker compose up --build
```

## Project Structure

```
mcp-typescript-template/
├── src/
│   ├── index.ts          # HTTP routing via createMcpHandler (stateless, per-request)
│   ├── tools.ts          # Tool registration (registerTools) and logic
│   ├── tools.test.ts     # Integration tests (in-memory client/server)
│   ├── config.ts         # Env var loading and validation (Effect Config)
│   ├── logger.ts         # Effect structured logging
│   └── lib/
│       ├── utils.ts      # MCP response helpers
│       ├── mcp-schema.ts  # Effect Schema → MCP Standard Schema adapter
│       ├── utils.test.ts # Unit tests
│       └── mcp-schema.test.ts # Schema adapter and dialect tests
├── dist/                 # Built output (generated)
├── tsconfig.json         # TypeScript configuration
├── vite.config.ts        # Vite build configuration
├── eslint.config.js      # ESLint configuration
├── Dockerfile            # Docker configuration
└── package.json          # Dependencies and scripts
```

## Architecture

This template follows a simple architecture:

- **HTTP Transport** - Uses Express with `createMcpHandler` (`@modelcontextprotocol/server`) for remote MCP connections
- **Stateless** - Per the MCP 2026-07-28 spec: no `initialize`/`initialized` handshake, no session ID — `getServer()` runs fresh for every HTTP request. Older (2025-era) clients are still served automatically via a built-in stateless fallback
- **Tool Registration** - `registerTools(server)` in `src/tools.ts` is the single source of truth for tool wiring; `getServer()` and the tests both use it
- **Typed I/O** - Effect Schema `inputSchema`/`outputSchema` values adapted to MCP Standard Schema, plus `structuredContent` for typed results
- **JSON Schema Dialects** - The adapter supports both MCP-requested `draft-07` and `draft-2020-12` output
- **Error Handling** - Genuine tool execution failures return `isError: true` via `createErrorResult` rather than being thrown; protocol, transport, and capability failures (e.g. an unsupported elicitation) can still reject the client call
- **Health Check** - `GET /health` is a plain liveness endpoint (used by the Docker health check); `GET /mcp` is routed to the MCP handler itself

## Example: Adding a New Tool

Add the registration inside `registerTools()` in `src/tools.ts`. See the `create-mcp-tool` skill (`.agents/skills/create-mcp-tool`) for the full walkthrough.

```typescript
import type { CallToolResult, ServerContext } from "@modelcontextprotocol/server";
import { Effect, Schema } from "effect";
import { toMcpSchema } from "./lib/mcp-schema.ts";
import { createTextResult, runMcpEffect } from "./lib/utils.ts";

server.registerTool(
  "my_tool",
  {
    title: "My Custom Tool",
    description: "Description of what this tool does",
    inputSchema: toMcpSchema(
      Schema.Struct({
        param1: Schema.String,
        param2: Schema.optional(Schema.Number),
      }),
    ),
    outputSchema: toMcpSchema(Schema.Struct({ output: Schema.String })),
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  (args, ctx) => runMcpEffect(myTool(args, ctx)),
);

function myTool(
  args: { param1: string; param2?: number },
  _ctx: ServerContext,
): Effect.Effect<CallToolResult> {
  return Effect.succeed(createTextResult({ output: args.param1 }));
}
```

Keep the tool workflow in `Effect` and use `runMcpEffect()` only where it crosses back into the MCP SDK callback API. For asynchronous work, use `Effect.tryPromise`; for independent parallel work, use `Effect.all` with explicit concurrency.

## Why Express?

This template uses Express for the HTTP server, which provides:

- **MCP SDK Compatibility** - Full compatibility with `@modelcontextprotocol/server`'s `createMcpHandler`, adapted to Node/Express via `@modelcontextprotocol/node`'s `toNodeHandler`
- **Mature & Stable** - Battle-tested HTTP server with extensive ecosystem
- **TypeScript Support** - Excellent TypeScript support with comprehensive type definitions
- **Middleware Ecosystem** - Rich ecosystem of middleware for common tasks
- **Documentation** - Comprehensive documentation and community support
- **Reliability** - Proven reliability for production applications

## Repository Guidelines

Contributors should review `AGENTS.md` for project structure, coding standards, and pull request expectations before opening changes.
