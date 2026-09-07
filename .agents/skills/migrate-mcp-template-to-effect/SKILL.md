---
name: migrate-mcp-template-to-effect
description: Migrate a project created from the pre-Effect MCP TypeScript template to the Effect-based template while preserving MCP behavior and deployment contracts. Use for this template's Zod/Pino-to-Effect migration, not for generic TypeScript-to-Effect rewrites or native Effect MCP server migrations.
metadata:
  author: nickytonline
  version: "1.0.0"
---

# Migrate the MCP TypeScript Template to Effect

Use this skill when an existing project was created from the earlier version of this repository and still uses Zod, Pino, direct environment parsing, and Promise-based tool handlers.

The goal is to adopt Effect for application workflows without changing the MCP protocol or making users learn a different server boundary.

## Preserve the external contract

Keep these behaviors unless the user explicitly requests a separate breaking change:

- `@modelcontextprotocol/server` remains the MCP implementation
- Express remains the HTTP server and `/mcp` remains the MCP endpoint
- `/health` remains a plain `{ "status": "ok" }` liveness endpoint
- `PORT`, `NODE_ENV`, `SERVER_NAME`, `SERVER_VERSION`, and `LOG_LEVEL` keep their names and defaults
- tool names, MCP annotations, structured output, and elicitation behavior remain compatible

Effect should be introduced behind the MCP SDK boundary. Do not replace the official MCP server with Effect's separate native MCP implementation as part of this migration.

## Inspect before editing

Check the working tree first and preserve unrelated user changes. Confirm the project has the expected pre-Effect patterns:

- `z.object(...)` input/output schemas
- Pino or `pino-pretty` logging
- direct `process.env` configuration
- `async` MCP callbacks with `try`/`catch`
- `Promise.all` for independent application work

Do not mechanically rewrite every Promise. Identify which code is application workflow and which code is an MCP, Express, Node, or test boundary.

## Migration map

| Earlier template | Effect-based template |
|---|---|
| Zod schemas | Effect `Schema.Struct`, adapted with `toMcpSchema()` |
| `.describe()` | `Schema.annotations({ description: "..." })` |
| Pino / `pino-pretty` | Effect `Logger.json` and the shared `logger` facade |
| `process.env` parsing | Effect `Config` with `ConfigProvider.fromEnv()` |
| `async` tool workflow | `Effect.gen(function* () { ... })` |
| `await` an Effect | `yield*` the Effect inside `Effect.gen` |
| Promise rejection handling | `Effect.tryPromise`, typed failures, and `Effect.catchAll` |
| `Promise.all` for independent effects | `Effect.all([...], { concurrency: "unbounded" })` |
| MCP callback returns Promise | `runMcpEffect()` at the callback boundary |

## Schema boundary

Define tool contracts with Effect Schema and adapt them at registration time:

```ts
const InputSchema = toMcpSchema(
  Schema.Struct({
    message: Schema.String,
  }),
);

server.registerTool(
  "echo",
  { inputSchema: InputSchema },
  (args, ctx) => runMcpEffect(echo(args, ctx)),
);
```

`toMcpSchema()` supplies both Standard Schema validation and the JSON Schema converter required by the MCP SDK. It supports the MCP SDK's `draft-07` and `draft-2020-12` targets. Keep elicitation's restricted `requestedSchema` as hand-written JSON Schema; it is not interchangeable with a general tool schema.

## Effect workflow rules

- Keep business logic in an `Effect.Effect` and cross back to the MCP callback API only with `runMcpEffect()`.
- Use `yield*` to execute Effects in `Effect.gen`; merely constructing an Effect does not run it.
- Use `Effect.tryPromise` around SDK, Express, Node, or other Promise APIs.
- Use `Effect.all` with explicit concurrency for independent application effects, such as parallel shutdown cleanup.
- Keep genuine tool failures in-band with `createErrorResult({ error })`; valid outcomes such as elicitation decline/cancel are normal `createTextResult` results.
- Use `yield* logger.info(...)` and `yield* logger.error(...)` inside workflows. Never log raw tool arguments.

## Tests and verification

Preserve the existing integration coverage and add focused tests for migration-sensitive behavior:

- `src/lib/mcp-schema.test.ts` validates Effect schemas and both JSON Schema dialects.
- `src/tools.test.ts` uses an in-memory MCP client/server to test tool calls, structured output, logging, elicitation outcomes, and modern-era behavior.
- Assert `client.listTools()` exposes the expected input/output JSON Schemas when schemas change.
- Run `npm run lint`, `npm run format:check`, `npm run build`, and `npm run test:ci`.
- Manually smoke-test `/health` and `/mcp` when the HTTP boundary changes.

## Documentation and release

Update `README.md`, `AGENTS.md`, and the `create-mcp-tool` skill so new tools follow the Effect patterns. Explain that the template remains MCP-standard and uses the official MCP SDK.

This migration is breaking for existing template consumers. Use a conventional `feat!:` commit and let the release workflow calculate the major version; do not manually edit the package version solely for this migration.

## Completion checklist

- [ ] Existing user changes were preserved.
- [ ] Zod, Pino, and direct configuration patterns were migrated.
- [ ] MCP registration still uses the official SDK and the existing HTTP boundary.
- [ ] Effect schema adapter and both JSON Schema targets are tested.
- [ ] Tool, elicitation, structured-output, and HTTP behavior are verified.
- [ ] README, `AGENTS.md`, and tool-authoring guidance are consistent.
- [ ] Required checks pass.
- [ ] The breaking change is recorded with `feat!:`.
