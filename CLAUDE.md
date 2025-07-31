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

### Template MCP Tools Available

The template includes one example tool to demonstrate MCP tool implementation:
- `echo` - Simple echo tool that returns the provided message

### Build System

- Uses Vite for building with ES modules output format
- TypeScript compilation targeting Node.js 18+ 
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

## Template Usage

This is a template project for creating new MCP servers. To customize:

1. Update `package.json` with your project name and description
2. Replace the echo tool in `src/index.ts` with your custom tools
3. Add additional TypeScript files for business logic as needed
4. Update README.md to document your specific MCP server functionality
5. Modify this CLAUDE.md file to reflect your project's architecture

## Adding New Tools

When adding new tools to the MCP server:

1. Register the tool with `server.registerTool()`
2. Provide a clear title and description
3. Define input schema using Zod for validation
4. Return responses in MCP content format with JSON stringified data
5. Handle errors gracefully and return appropriate error messages