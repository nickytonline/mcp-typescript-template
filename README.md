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
- **OAuth 2.1 Compatible** - Optional OAuth implementation (can use Pomerium for external auth or built-in server implementation)

## Getting Started

1. **Clone or use this template**

   ```bash
   git clone <your-repo-url>
   cd mcp-typescript-template
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

## Authentication & Authorization

This template provides **optional** OAuth 2.1 authentication with three deployment modes. Gateway-based deployment is a common production pattern that separates authentication concerns.

### 📋 Mode Overview

The three authentication modes serve different purposes:

- **`none`** - No authentication (public servers, or when gateway handles all OAuth/security)
- **`full`** - Complete OAuth flow within MCP server (production-ready when you don't have a gateway)  
- **`resource_server`** - Only validates tokens (requires either `full` mode or external gateway to issue tokens)

**Key insight**: `resource_server` mode only *validates* tokens - it doesn't *issue* them. So you need either:
1. **Gateway + resource_server** (common enterprise pattern)
2. **Full mode standalone** (self-contained OAuth solution)

### 🔧 Authentication Modes

#### Resource Server Mode
- **Resource Server Pattern**: MCP server validates tokens issued by external OAuth providers
- **Token Validation**: Supports both JWT validation and token introspection  
- **Stateless**: No OAuth routes, sessions, or cookies in MCP server
- **Scalable**: Easy to horizontally scale the MCP server
- **Gateway Compatible**: Commonly used with reverse proxies/gateways for enterprise deployments
- **Best for**: Deployments where authentication is handled externally

#### Full Mode (OAuth Proxy + Resource Server)
- **Dual Role**: MCP server acts as both OAuth client (proxy) AND resource server
- **External IdP Integration**: Delegates authentication to external providers (Auth0, Google, etc.)
- **OAuth Endpoints**: Provides its own OAuth endpoints for MCP clients
- **PKCE Support**: Full PKCE implementation for secure authorization flows
- **Self-Contained**: Provides complete OAuth flow without requiring external gateway infrastructure
- **Discovery Endpoints**: Provides OAuth 2.1 discovery metadata for automatic client configuration
- **Best for**: Production deployments without gateway infrastructure, provides complete OAuth flow for MCP clients

#### No Auth Mode (Default)
- **No Authentication**: MCP server accepts all requests without authentication
- **Use Cases**: Public servers, or when gateway handles all OAuth/security layers
- **Security Note**: Consider enabling authentication even for local development to build secure habits
- **Gateway Compatible**: Can still benefit from gateway for rate limiting, SSL termination, etc.
- **Simple Setup**: Just set `ENABLE_AUTH=false` or omit auth configuration

### 🚀 Quick Setup

#### 1. Resource Server Mode
```bash
# .env
ENABLE_AUTH=true
AUTH_MODE=resource_server
OAUTH_ISSUER=https://your-domain.auth0.com
OAUTH_AUDIENCE=your-api-identifier  # optional
# BASE_URL=https://mcp.yourdomain.com  # optional, defaults to http://localhost:PORT
```

**Common Pattern: With Gateway**
```yaml
# pomerium-config.yaml
routes:
  - from: https://mcp.yourdomain.com
    to: http://localhost:3000
    policies:
      - allow:
          and:
            - authenticated_user: true
```

**Alternative: Direct OAuth**
```bash
# Note: MCP clients would need to implement OAuth flow themselves
# Clients get tokens directly from Auth0, send to MCP server
curl -H "Authorization: Bearer ${AUTH0_TOKEN}" http://localhost:3000/mcp
```

#### 2. Full Mode (Self-Contained OAuth)
```bash
# .env
ENABLE_AUTH=true
AUTH_MODE=full
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_AUTH_ENDPOINT=https://your-domain.auth0.com/authorize
OAUTH_TOKEN_ENDPOINT=https://your-domain.auth0.com/oauth/token
# OAUTH_REDIRECT_URI=http://localhost:3000/callback  # optional, defaults to BASE_URL/callback
# BASE_URL=https://mcp.yourdomain.com  # optional, defaults to http://localhost:PORT
```

**OAuth 2.1 Endpoints (automatically available):**
- `GET /.well-known/oauth-authorization-server` - OAuth server metadata
- `GET /.well-known/oauth-protected-resource` - Resource server metadata  
- `GET /authorize` - OAuth authorization endpoint (with PKCE)
- `POST /token` - Token exchange endpoint
- `POST /introspect` - Token introspection endpoint
- `POST /revoke` - Token revocation endpoint

#### 3. No Auth Mode (Default)
```bash
# .env (or just omit ENABLE_AUTH)
ENABLE_AUTH=false
```

**⚠️ Security Recommendation**: While convenient for getting started, consider enabling authentication even for local development to build secure practices and catch integration issues early.

### 🔐 Token Validation

Both modes validate tokens using the **resource server pattern**:

```bash
# Make authenticated requests
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  http://localhost:3000/mcp
```

### 🏗️ Architecture

```
┌─── Resource Server Mode (Production) ───┐  ┌──── Full Mode (Proxy + Resource) ───┐  ┌── No Auth (Default) ──┐
│                                         │  │                                     │  │                       │
│  MCP Client → [Gateway] → MCP Server    │  │  MCP Client → MCP Server           │  │  MCP Client           │
│       ↓                    ↓            │  │              ↓        ↓           │  │      ↓               │
│  External OAuth → Token Validation      │  │       OAuth Proxy → External IdP  │  │  MCP Server           │
│                                         │  │                                     │  │   (Open Access)      │
│  ✅ Enterprise ready                     │  │  ✅ Production ready                │  │  ✅ Simple setup      │
│  ✅ Stateless & scalable                │  │  ✅ OAuth 2.1 compliant            │  │  ✅ No auth overhead  │
│  ✅ Security best practices             │  │  ✅ PKCE + Discovery               │  │  ✅ Perfect for dev   │
│  ✅ JWT + Token introspection           │  │  ✅ Works with VS Code             │  │                       │
└─────────────────────────────────────────┘  └─────────────────────────────────────┘  └───────────────────────┘
```

### 🔧 Provider Examples

<details>
<summary><strong>Auth0 Configuration</strong></summary>

**Resource Server Mode:**
```bash
OAUTH_ISSUER=https://your-domain.auth0.com
OAUTH_AUDIENCE=your-api-identifier
```

**Full Mode:**
```bash
OAUTH_AUTH_ENDPOINT=https://your-domain.auth0.com/authorize
OAUTH_TOKEN_ENDPOINT=https://your-domain.auth0.com/oauth/token
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
```
</details>

<details>
<summary><strong>Google OAuth Configuration</strong></summary>

**Resource Server Mode:**
```bash
OAUTH_ISSUER=https://accounts.google.com
OAUTH_AUDIENCE=your-client-id.apps.googleusercontent.com
```

**Full Mode:**
```bash
OAUTH_AUTH_ENDPOINT=https://accounts.google.com/o/oauth2/v2/auth
OAUTH_TOKEN_ENDPOINT=https://oauth2.googleapis.com/token
OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
OAUTH_CLIENT_SECRET=your-client-secret
```
</details>

### 🛠️ Customization

The auth implementation is modular and can be easily:
- Disabled completely (set `ENABLE_AUTH=false`)
- Removed entirely (delete `src/auth/` directory)
- Extended with custom validation logic
- Integrated with other OAuth providers

See `src/auth/` for implementation details.

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
