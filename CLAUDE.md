# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Build the project
npm run build

# Development with hot reloading (builds and starts server with watch mode)
npm run dev

# Start the production server
npm start

# Code quality
npm run lint           # Check for linting issues
npm run lint:fix       # Fix auto-fixable linting issues
npm run format         # Format code with Prettier
npm run format:check   # Check code formatting
```

## Architecture Overview

This is a TypeScript template for building Model Context Protocol (MCP) servers. The architecture follows a simple two-layer pattern:

### Core Components

- **`src/index.ts`** - Main MCP server entry point that:
  - Sets up the HTTP server using Express on port 3000 (configurable via PORT env var)
  - Defines all available MCP tools with their JSON schemas
  - Routes tool calls to registered tool handlers
  - Handles error responses in MCP format
- **`src/config.ts`** - Environment configuration with validation using Zod
- **`src/logger.ts`** - Structured logging with Pino (OpenTelemetry compatible)
- **`src/lib/utils.ts`** - Utility functions for MCP response formatting

### Template MCP Tools Available

The template includes one example tool to demonstrate MCP tool implementation:
- `echo` - Simple echo tool that returns the provided message

### Build System

- Uses Vite for building with ES modules output format
- TypeScript compilation targeting Node.js 22.18+ (native type stripping enabled by default)
- External dependency: `@modelcontextprotocol/sdk` (not bundled)
- Source alias `@` points to `src/` directory
- Output goes to `dist/` directory

### Code Style

- ESLint with TypeScript recommended rules
- Prettier formatting (empty config uses defaults)
- Private class methods use `#` syntax
- Unused parameter pattern: prefix with `_`
- `@typescript-eslint/no-explicit-any` set to warn (used for MCP argument flexibility)

## Key Implementation Details

- All tool responses are wrapped in MCP `content` format with `type: 'text'` and JSON stringified data
- Server runs as HTTP transport (not stdio) for remote MCP connections
- Uses Express for reliable HTTP handling with excellent TypeScript support
- Session management handles MCP initialization and transport lifecycle
- Error handling returns MCP-formatted error messages rather than throwing
- **Structured Logging**: Uses Pino for production-ready logging with OpenTelemetry trace correlation
- **Configuration Management**: Environment variables validated with Zod schemas
- **Graceful Shutdown**: Proper SIGTERM/SIGINT handling for container environments

## Template Usage

This is a template project for creating new MCP servers. To customize:

1. Update `package.json` with your project name and description
2. Update environment variables in `src/config.ts` (SERVER_NAME, SERVER_VERSION, etc.)
3. Replace the echo tool in `src/index.ts` with your custom tools
4. Add additional TypeScript files for business logic as needed
5. Update README.md to document your specific MCP server functionality
6. Modify this CLAUDE.md file to reflect your project's architecture

## Environment Variables

The following environment variables are supported (see `src/config.ts`):

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production/test)
- `SERVER_NAME` - MCP server name (default: mcp-typescript-template)
- `SERVER_VERSION` - Server version (default: 1.0.0)
- `LOG_LEVEL` - Logging level (error/warn/info/debug, default: info)

## Logging Best Practices

- Use appropriate log levels: `error`, `warn`, `info`, `debug`
- Include relevant context in log messages (user IDs, session IDs, etc.)
- Log structured data as the second parameter: `logger.info("message", { key: value })`
- Error logs should include error details: `logger.error("Error message", { error: error.message })`
- The logger automatically includes trace correlation when OpenTelemetry is configured
- Use the `logger` from `src/logger.ts` instead of `console.log`

## Adding New Tools

When adding new tools to the MCP server:

1. Register the tool with `server.registerTool()`
2. Provide a clear title and description
3. Define input schema using Zod for validation
4. Return responses in MCP content format with JSON stringified data
5. Handle errors gracefully and return appropriate error messages
6. Use structured logging to track tool usage: `logger.info("Tool executed", { toolName, args })`
7. Log errors with context: `logger.error("Tool execution failed", { toolName, error: error.message })`