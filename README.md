# MCP TypeScript Template

A TypeScript template for building remote Model Context Protocol (MCP) servers with modern tooling and best practices while leveraging the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Features

This template provides:

- **TypeScript** - Full TypeScript support with strict configuration
- **Vite** - Fast build system with ES modules output
- **Express** - Fast, unopinionated web framework for HTTP server
- **ESLint + Prettier** - Code quality and formatting
- **Docker** - Containerization support
- **Example Tool** - Simple echo tool to demonstrate MCP tool implementation

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

The template includes one example tool:

### echo

Echoes back the provided message - a simple example to demonstrate MCP tool implementation.

**Parameters:**

- `message` (string) - The message to echo back

## Customizing Your MCP Server

1. **Update package.json** - Change name, description, and keywords
2. **Modify src/index.ts** - Replace the echo tool with your custom tools
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

```yaml
# docker-compose.yml
version: "3.8"
services:
  mcp-server:
    build: .
    ports:
      - "3000:3000"
    environment:
      - PORT=3000
```

```bash
docker-compose up --build
```

## Project Structure

```
mcp-typescript-template/
├── src/
│   └── index.ts          # Main MCP server entry point
├── dist/                 # Built output (generated)
├── .eslintrc.js         # ESLint configuration
├── .prettierrc          # Prettier configuration
├── tsconfig.json        # TypeScript configuration
├── vite.config.ts       # Vite build configuration
├── Dockerfile           # Docker configuration
└── package.json         # Dependencies and scripts
```

## Architecture

This template follows a simple architecture:

- **HTTP Transport** - Uses Express with StreamableHTTPServerTransport for remote MCP connections
- **Tool Registration** - Tools are registered with JSON schemas for input validation
- **Error Handling** - Proper MCP-formatted error responses
- **Session Management** - Handles MCP session initialization and management

## Example: Adding a New Tool

```typescript
import { createTextResult } from "./lib/utils.js";

server.registerTool(
  "my_tool",
  {
    title: "My Custom Tool",
    description: "Description of what this tool does",
    inputSchema: {
      param1: z.string().describe("Description of param1"),
      param2: z.number().optional().describe("Optional parameter"),
    },
  },
  async (args) => {
    // Your tool logic here
    const result = await myCustomLogic(args.param1, args.param2);

    return createTextResult(result);
  },
);
```

## Why Express?

This template uses Express for the HTTP server, which provides:

- **MCP SDK Compatibility** - Full compatibility with the MCP TypeScript SDK's StreamableHTTPServerTransport
- **Mature & Stable** - Battle-tested HTTP server with extensive ecosystem
- **TypeScript Support** - Excellent TypeScript support with comprehensive type definitions
- **Middleware Ecosystem** - Rich ecosystem of middleware for common tasks
- **Documentation** - Comprehensive documentation and community support
- **Reliability** - Proven reliability for production applications

## Repository Guidelines

Contributors should review `AGENTS.md` for project structure, coding standards, and pull request expectations before opening changes.
