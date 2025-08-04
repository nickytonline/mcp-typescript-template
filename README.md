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
- **Optional OAuth 2.1** - Add authentication when needed with simple configuration

## Quick Start

Get your MCP server running immediately:

```bash
git clone <your-repo-url>
cd mcp-typescript-template
npm install && npm run dev
```

That's it! Your MCP server is now running at `http://localhost:3000` with no authentication required.

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
│   ├── auth/             # Optional OAuth authentication module
│   │   ├── index.ts      # Auth initialization and middleware factory
│   │   ├── middleware.ts # Authentication middleware
│   │   ├── oauth-provider.ts # OAuth client implementation
│   │   ├── routes.ts     # OAuth routes (/authorize, /callback)
│   │   └── token-validator.ts # Token validation (gateway/builtin)
│   ├── lib/
│   │   └── utils.ts      # MCP utility functions
│   ├── config.ts         # Environment configuration with validation
│   ├── logger.ts         # Structured logging with Pino
│   └── index.ts          # Main MCP server entry point
├── dist/                 # Built output (generated)
├── .env.example          # Environment variables template
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

## Enable Authentication (Optional)

When you need OAuth 2.1 authentication with token validation, it's just a few config lines away:

### Quick Setup

1. **Add to your `.env` file:**
   ```bash
   ENABLE_AUTH=true
   OAUTH_ISSUER=https://your-provider.com
   OAUTH_CLIENT_ID=your-client-id
   OAUTH_CLIENT_SECRET=your-client-secret
   ```

2. **Restart the server**
   ```bash
   npm run dev
   ```

Your MCP server now requires valid OAuth tokens for all API requests.

### Use Cases

**Authentication Disabled** (`ENABLE_AUTH=false` or omitted):
- Public MCP servers
- Gateway-protected deployments (Pomerium, nginx with auth, etc.)
- Development and testing
- Internal corporate networks with perimeter security

**Authentication Enabled** (`ENABLE_AUTH=true`):
- Direct OAuth 2.1 with token validation
- Self-contained secure deployment  
- Production servers without gateway infrastructure

### OAuth Provider Examples

**Auth0:**
```bash
ENABLE_AUTH=true
OAUTH_ISSUER=https://your-domain.auth0.com
OAUTH_CLIENT_ID=your-auth0-client-id
OAUTH_CLIENT_SECRET=your-auth0-client-secret
OAUTH_AUDIENCE=your-api-identifier
```

**Okta:**
```bash
ENABLE_AUTH=true
OAUTH_ISSUER=https://your-domain.okta.com
OAUTH_CLIENT_ID=your-okta-client-id
OAUTH_CLIENT_SECRET=your-okta-client-secret
```

**Google:**
```bash
ENABLE_AUTH=true
OAUTH_ISSUER=https://accounts.google.com
OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
OAUTH_CLIENT_SECRET=your-google-client-secret
```

### Making Authenticated Requests

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  http://localhost:3000/mcp
```

### OAuth 2.1 Endpoints (when enabled)

The server automatically provides these endpoints:
- `GET /.well-known/oauth-authorization-server` - OAuth server metadata
- `GET /.well-known/oauth-protected-resource` - Resource server metadata
- `GET /oauth/authorize` - Authorization endpoint (with PKCE)
- `POST /oauth/token` - Token exchange endpoint

### Removing Authentication

To completely remove OAuth support:
1. Delete the `src/auth/` directory
2. Remove auth imports from `src/index.ts`
3. Remove OAuth environment variables from `src/config.ts`

The core MCP server functionality is completely independent of the authentication layer.

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
