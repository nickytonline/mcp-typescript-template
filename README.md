# MCP TypeScript Template

A TypeScript template for building remote Model Context Protocol (MCP) servers with modern tooling, best practices, and **MCP Sampling support** while leveraging the [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

## Features

This template provides:

- **TypeScript** - Full TypeScript support with strict configuration
- **Vite** - Fast build system with ES modules output
- **Express** - Fast, unopinionated web framework for HTTP server
- **ESLint + Prettier** - Code quality and formatting
- **Docker** - Containerization support
- **MCP Sampling** - AI-powered content generation with security best practices
- **Example Tools** - Echo tool and AI-powered document summarization
- **Comprehensive Tests** - Full test coverage with Vitest

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

The template includes example tools to demonstrate MCP capabilities:

### echo

Echoes back the provided message - a simple example to demonstrate basic MCP tool implementation.

**Parameters:**

- `message` (string) - The message to echo back

### summarize_document

AI-powered document summarization using MCP sampling. Demonstrates secure sampling with prompt injection protection.

**Parameters:**

- `content` (string) - Document content to summarize
- `bullet_points` (number, optional) - Number of bullet points (1-10, default: 3)
- `format` (enum, optional) - Output format: "bullets" or "paragraph" (default: "bullets")

**Example Response:**

```json
{
  "summary": "• Key point 1\n• Key point 2\n• Key point 3",
  "metadata": {
    "format": "bullets",
    "bullet_points": 3,
    "model": "claude-3-5-sonnet",
    "finish_reason": "stop",
    "tokens_used": 250
  }
}
```

## MCP Sampling

This template includes full support for **MCP Sampling** - a bidirectional communication pattern that allows your tools to request AI-generated content from connected clients.

### What is Sampling?

Sampling inverts the traditional MCP pattern. Instead of AI calling your tools, **your tools call the AI** to generate content based on prompts. This enables:

- 📝 Document summarization
- 🎯 Sentiment analysis
- 🌐 Content translation
- 💡 Creative content generation
- 🔍 Natural language understanding

### Quick Example

```typescript
import { createSamplingContext } from "./lib/sampling.ts";
import { createSafePrompt } from "./lib/sampling-security.ts";

// Create sampling context
const samplingContext = createSamplingContext(server.server);

// Use in a tool
server.registerTool("my_tool", config, async (args) => {
  // Securely create prompt with user input
  const prompt = createSafePrompt(
    "You are a helpful assistant.",
    args.userContent,
    "Summarize the above content."
  );

  // Request AI-generated content
  const response = await samplingContext.sample({
    prompt,
    temperature: 0.3,
    max_tokens: 500,
  });

  return createTextResult({ result: response.content });
});
```

### Security

The template includes built-in prompt injection protection via `createSafePrompt()`:

```typescript
// ❌ UNSAFE: User input directly in prompt
const unsafe = `Summarize: ${userInput}`;

// ✅ SAFE: Use delimiter pattern
const safe = createSafePrompt(
  "System instructions",
  userInput,  // Automatically wrapped with security delimiters
  "Task instructions"
);
```

### Configuration

Sampling is configured via environment variables:

```bash
SAMPLING_ENABLED=true                    # Enable/disable sampling
SAMPLING_TIMEOUT_MS=30000                # Request timeout
SAMPLING_MAX_TOKENS_DEFAULT=1000         # Default max tokens
SAMPLING_TEMPERATURE_DEFAULT=0.5         # Default temperature
SAMPLING_LOG_REQUESTS=true               # Log sampling operations
```

### Learn More

- **Comprehensive Guide**: See `CLAUDE.md` for detailed sampling documentation
- **Security Best Practices**: See `docs/SAMPLING-BEST-PRACTICES.md`
- **PRD**: See `docs/PRD-MCP-SAMPLING.md` for complete specifications
- **Tests**: See `src/lib/sampling.test.ts` for usage examples

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
│   ├── index.ts                    # Main MCP server entry point
│   ├── config.ts                   # Environment configuration with Zod
│   ├── logger.ts                   # Structured logging with Pino
│   ├── types/
│   │   └── sampling.ts             # Sampling types and errors
│   └── lib/
│       ├── utils.ts                # MCP response formatting utilities
│       ├── sampling.ts             # Sampling implementation
│       ├── sampling-security.ts    # Prompt injection protection
│       └── *.test.ts               # Unit tests
├── docs/
│   ├── PRD-MCP-SAMPLING.md         # Product requirements document
│   ├── ISSUE-MCP-SAMPLING.md       # Implementation issue
│   └── SAMPLING-BEST-PRACTICES.md  # Security best practices
├── dist/                           # Built output (generated)
├── .eslintrc.js                    # ESLint configuration
├── .prettierrc                     # Prettier configuration
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite build configuration
├── Dockerfile                      # Docker configuration
├── CLAUDE.md                       # AI assistant documentation
└── package.json                    # Dependencies and scripts
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
