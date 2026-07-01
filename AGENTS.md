# Repository Guidelines

TypeScript template for building [Model Context Protocol (MCP)](https://modelcontextprotocol.io) servers over HTTP.

## Key Commands

```bash
# Development (hot reload via native Node.js type stripping)
npm run dev

# Build (Vite → ES modules in dist/)
npm run build

# Production
npm start

# Lint & format
npm run lint
npm run lint:fix
npm run format
npm run format:check

# Tests
npm run test       # interactive Vitest
npm run test:ci    # outputs test-results.json
```

## Before Submitting

Always run these and fix any failures before opening a PR:

```bash
npm run lint && npm run format:check && npm run build && npm run test:ci
```

## Project Structure

```
src/
  index.ts       # HTTP routing, session lifecycle; calls registerTools() in getServer()
  tools.ts       # registerTools() wiring + per-tool logic functions
  tools.test.ts  # colocated integration tests (in-memory client/server)
  config.ts      # Env var validation via Zod
  logger.ts      # Pino structured logging (OpenTelemetry compatible)
  lib/
    utils.ts       # MCP response helpers (createTextResult, createErrorResult)
    utils.test.ts  # colocated unit tests
dist/            # compiled output (ES modules)
```

Config files (`vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `Dockerfile`) live at the repo root.

## Architecture

- HTTP transport via Express on `PORT` (default 3000) — **not** stdio
- Tools registered via `registerTools(server)` in `src/tools.ts`, the single source of truth for tool wiring — called from `getServer()` in `src/index.ts` and reused by the tests
- Tool responses use `createTextResult` / `createErrorResult` from `src/lib/utils.ts`: a text `content` block plus `structuredContent` (for clients that declare an `outputSchema`)
- Genuine execution failures return `isError: true` (via `createErrorResult`), not thrown; valid outcomes (e.g. a user declining an elicitation) are normal results
- Session lifecycle managed via `StreamableHTTPServerTransport`
- Graceful shutdown on `SIGTERM`/`SIGINT`

### Build System

- Vite bundles to ES modules; `@modelcontextprotocol/sdk` is external (not bundled)
- `@` path alias maps to `src/`
- Node.js 24+ required (native TypeScript type stripping used in dev)

## Environment Variables

Defined and validated in `src/config.ts`:

| Variable         | Default                    | Description                          |
|------------------|----------------------------|--------------------------------------|
| `PORT`           | `3000`                     | HTTP server port                     |
| `NODE_ENV`       | —                          | `development` / `production` / `test` |
| `SERVER_NAME`    | `mcp-typescript-template`  | MCP server name                      |
| `SERVER_VERSION` | `1.0.0`                    | MCP server version                   |
| `LOG_LEVEL`      | `info`                     | `error` / `warn` / `info` / `debug`  |

## Coding Conventions

- TypeScript with ES module syntax (`import`/`export`)
- Prettier defaults: 2-space indent, double quotes, trailing commas
- ESLint with `@typescript-eslint` — `any` is discouraged (warn)
- Private class methods use `#` prefix
- Intentionally unused params/vars: prefix with `_`
- `camelCase` for functions/variables, `PascalCase` for types
- Descriptive filenames: `logger.ts`, `utils.ts`

## Logging

Use `logger` from `src/logger.ts` — **never `console.log`**.

```ts
// Structured data first, message second
logger.info({ sessionId, toolName }, "Tool executed");
logger.error({ error: error.message, toolName }, "Tool execution failed");
```

Log levels: `error` > `warn` > `info` > `debug`. Include relevant IDs (session, user, tool). Pino automatically correlates traces when OpenTelemetry is configured.

## Adding a New Tool

See the `create-mcp-tool` skill (`.agents/skills/create-mcp-tool`) for the full walkthrough. In short:

1. Add the `server.registerTool()` call inside `registerTools()` in `src/tools.ts`
2. Provide a `title`, `description`, Zod `inputSchema`, an `outputSchema`, and `annotations` (e.g. `readOnlyHint`)
3. Return `createTextResult(result)` on success (it also emits `structuredContent`)
4. On genuine failure return `createErrorResult({ error })` (sets `isError: true`); don't throw
5. Log with `logger.info({ toolName, args }, "Tool executed")` on success
6. Log with `logger.error({ toolName, error: error.message }, "Tool execution failed")` on failure
7. Add integration tests to `src/tools.test.ts` (import `registerTools`, wire an in-memory client/server)

## Testing

- Framework: Vitest
- Test files: `*.test.ts`, colocated beside the source (see `src/lib/utils.test.ts`)
- Cover new tools, transports, and config logic with focused tests
- Use `async/await` for all async tests
- Write a failing test that reproduces a bug before fixing it

## Using This Template

To build your own MCP server from this template:

1. Update `package.json` (name, description, version)
2. Add/replace env vars in `src/config.ts`
3. Replace the `echo` / `elicit_echo` tools in `src/tools.ts` with your tools
4. Add business logic under `src/`
5. Update `README.md` and this `AGENTS.md` to reflect your project

## Commit & PR Guidelines

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `chore:`, `docs:`
- PR description: summarize user-facing impact, link issues, list any new env vars
- Include verification evidence: `npm run lint`, `npm run test:ci`
