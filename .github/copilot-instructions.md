# GitHub Copilot Instructions

This file provides guidance to GitHub Copilot when working with code in this repository.

## Project Overview

This is a TypeScript template for building Model Context Protocol (MCP) servers with modern tooling and best practices.

## Architecture

- **MCP Server**: HTTP transport using Express and the MCP TypeScript SDK
- **Structured Logging**: Pino with OpenTelemetry trace correlation support
- **Configuration**: Environment variables validated with Zod schemas
- **Build System**: Vite for fast ES module builds
- **Testing**: Vitest for unit and integration testing

## Core Components

- `src/index.ts` - Main MCP server entry point with Express HTTP transport
- `src/config.ts` - Environment configuration with Zod validation
- `src/logger.ts` - Structured logging with Pino (OTel compatible)
- `src/lib/utils.ts` - Utility functions for MCP response formatting

## Development Guidelines

### Logging
- **Always use structured logging**: Import and use `logger` from `src/logger.ts`
- **Never use `console.log`** - use appropriate log levels instead
- **Include context**: `logger.info("message", { key: value })`
- **Error logging**: `logger.error("Error message", { error: error.message })`

### Configuration
- **Environment variables**: Add new config to `src/config.ts` with Zod validation
- **Access config**: Use `getConfig()` function, never access `process.env` directly
- **Validation**: All environment variables must have Zod schema validation

### MCP Tools
- **Tool registration**: Use `server.registerTool()` with clear title and description
- **Input validation**: Define schemas using Zod for type safety
- **Response format**: Return MCP content format using `createTextResult()` utility
- **Error handling**: Catch errors and return appropriate MCP error responses

### Code Style
- **TypeScript strict mode**: Always maintain strict type checking
- **ES modules**: Use `.js` extensions in imports (TypeScript compilation target)
- **Functional patterns**: Prefer functional programming where appropriate
- **Error handling**: Use try-catch blocks with structured error logging

### Testing
- **Vitest**: Use Vitest for all testing needs
- **Test files**: Place `.test.ts` files alongside source files
- **Coverage**: Aim for good test coverage of core functionality

## Commands

```bash
npm run dev        # Development with hot reload
npm run build      # Production build
npm start          # Start production server
npm test           # Run tests in watch mode
npm run test:ci    # Run tests once for CI
npm run lint       # Check linting
npm run lint:fix   # Fix auto-fixable lint issues
npm run format     # Format code with Prettier
```

## Environment Variables

See `src/config.ts` for all supported environment variables:

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production/test)
- `SERVER_NAME` - MCP server name
- `SERVER_VERSION` - Server version
- `LOG_LEVEL` - Logging level (error/warn/info/debug)

## Common Patterns

### Adding a New MCP Tool

```typescript
server.registerTool(
  "tool_name",
  {
    title: "Tool Title",
    description: "Clear description of what this tool does",
    inputSchema: {
      param1: z.string().describe("Parameter description"),
      param2: z.number().optional().describe("Optional parameter"),
    },
  },
  async (args) => {
    logger.info("Tool executed", { toolName: "tool_name", args });
    
    try {
      // Tool logic here
      const result = await doSomething(args.param1, args.param2);
      
      return createTextResult(result);
    } catch (error) {
      logger.error("Tool execution failed", { 
        toolName: "tool_name", 
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }
);
```

### Error Handling Pattern

```typescript
try {
  // Code that might throw
  const result = await riskyOperation();
  logger.info("Operation succeeded", { result });
} catch (error) {
  logger.error("Operation failed", { 
    error: error instanceof Error ? error.message : error,
    context: "additional context"
  });
  // Handle error appropriately
}
```

### Configuration Access

```typescript
import { getConfig } from "./config.js";

const config = getConfig();
const port = config.PORT;
const serverName = config.SERVER_NAME;
```

## Important Notes

- **File extensions**: Use `.js` in import statements (TypeScript compilation requirement)
- **OpenTelemetry ready**: Logger automatically correlates with OTel traces when configured
- **Production ready**: Includes graceful shutdown, error handling, and structured logging
- **Template usage**: This is a template - customize for your specific MCP server needs