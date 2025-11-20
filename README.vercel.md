# MCP TypeScript Template - Vercel Serverless Edition

A TypeScript template for building remote Model Context Protocol (MCP) servers deployable to Vercel's serverless platform.

## Features

- **TypeScript** - Full TypeScript support with strict configuration
- **Vercel Serverless** - Deploy as serverless functions on Vercel
- **MCP SDK** - Built on the official MCP TypeScript SDK
- **Example Tool** - Simple echo tool to demonstrate MCP tool implementation
- **Shared Libraries** - Reusable utilities for config, logging, and more
- **ESLint + Prettier** - Code quality and formatting
- **Docker Support** - Can still be run as a traditional Express server

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Run locally with Vercel dev server
npm run dev

# Or run as traditional Express server
npm run dev:express
```

The serverless endpoints will be available at:
- `http://localhost:3000/` - Server info
- `http://localhost:3000/mcp` - MCP protocol endpoint

### Deploy to Vercel

#### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/nickytonline/mcp-typescript-template/tree/vercel-serverless)

#### Manual Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy to Vercel
vercel

# Or deploy to production
vercel --prod
```

## Project Structure

```
mcp-typescript-template/
├── api/              # Vercel serverless functions
│   ├── index.ts      # Server info endpoint
│   └── mcp.ts        # Main MCP protocol handler
├── lib/              # Shared libraries
│   ├── config.ts     # Configuration management
│   ├── logger.ts     # Logging utilities
│   └── utils.ts      # MCP helper functions
├── src/              # Traditional Express server (optional)
│   └── index.ts      # Express-based MCP server
└── vercel.json       # Vercel configuration
```

## Architecture

### Serverless Functions

The Vercel deployment uses two serverless functions:

1. **`/api/index.ts`** - Returns server information and available endpoints
2. **`/api/mcp.ts`** - Handles MCP protocol requests

### Session Management

**Important Note**: This template uses in-memory session storage, which works for demonstration but has limitations in serverless environments:

- Sessions are stored in the function's memory
- Sessions may be lost when functions scale down
- Not suitable for production with multiple concurrent users

**For production**, consider:
- Vercel KV for persistent session storage
- Redis for session management
- Stateless authentication with JWT

## Adding Custom Tools

Edit `api/mcp.ts` and add your tools:

```typescript
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

## Environment Variables

Set these in your Vercel project settings:

- `NODE_ENV` - Environment (development/production/test)
- `SERVER_NAME` - MCP server name (default: mcp-typescript-template)
- `SERVER_VERSION` - Server version (default: 1.0.0)
- `LOG_LEVEL` - Logging level (error/warn/info/debug)

## Configuration

### Vercel Configuration (`vercel.json`)

```json
{
  "version": 2,
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "functions": {
    "api/**/*.ts": {
      "runtime": "nodejs22.x",
      "memory": 1024,
      "maxDuration": 30
    }
  }
}
```

Key settings:
- **runtime**: Node.js 22.x for latest features
- **memory**: 1024MB for adequate processing
- **maxDuration**: 30 seconds max execution time

## Scripts

```bash
# Development
npm run dev              # Run with Vercel dev server
npm run dev:express      # Run as Express server

# Build
npm run build            # Build TypeScript
npm run vercel-build     # Vercel build hook

# Quality
npm run lint             # Check code quality
npm run lint:fix         # Fix linting issues
npm run format           # Format code
npm run format:check     # Check formatting

# Testing
npm run test             # Run tests
npm run test:ci          # Run tests in CI
```

## Differences from Express Version

| Feature | Express | Vercel Serverless |
|---------|---------|-------------------|
| Hosting | Self-hosted | Managed serverless |
| Scaling | Manual | Automatic |
| Cold starts | No | Yes (~300ms) |
| Cost | Fixed | Pay-per-use |
| State | Persistent | Ephemeral |
| Session storage | In-memory (reliable) | In-memory (unreliable) |

## Limitations

1. **Cold Starts**: First request may take longer (~300-500ms)
2. **Session Persistence**: In-memory sessions don't persist across function invocations
3. **Execution Time**: Limited to 30 seconds per request (configurable up to 5 minutes on paid plans)
4. **Memory**: Limited to configured amount (1024MB default)

## Production Recommendations

1. **Use Persistent Storage**: Implement Vercel KV or Redis for sessions
2. **Add Monitoring**: Use Vercel Analytics or external monitoring
3. **Implement Rate Limiting**: Protect against abuse
4. **Set Environment Variables**: Configure all environment variables in Vercel dashboard
5. **Enable Error Tracking**: Use Sentry or similar for error tracking

## Vercel-Specific Features

### Edge Functions (Optional)

For lower latency, you can convert to Edge Functions by changing the runtime:

```json
{
  "functions": {
    "api/**/*.ts": {
      "runtime": "edge"
    }
  }
}
```

Note: Edge runtime has limitations (no Node.js APIs, no file system access).

### Custom Domains

Add custom domains in your Vercel project settings:
1. Go to Project Settings → Domains
2. Add your domain
3. Configure DNS as instructed

## Troubleshooting

### Session not found errors

If you see "Session not found" errors, your function may have scaled down. Consider:
- Using persistent storage
- Increasing function memory
- Implementing session recovery logic

### Build failures

Check:
- All dependencies are listed in `package.json`
- TypeScript compiles without errors (`npm run build`)
- No file system operations (use environment variables instead)

### Timeout errors

If requests timeout:
- Optimize your tool implementations
- Consider breaking into smaller operations
- Increase `maxDuration` in `vercel.json`

## Migration Guide

To migrate an existing MCP server to Vercel:

1. Create `api/` directory with serverless handlers
2. Move shared code to `lib/` directory
3. Add `vercel.json` configuration
4. Update imports to use `.js` extensions
5. Add `@vercel/node` to dev dependencies
6. Test locally with `npm run dev`
7. Deploy with `vercel`

## Resources

- [Vercel Documentation](https://vercel.com/docs)
- [MCP Documentation](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Vercel Serverless Functions](https://vercel.com/docs/functions)

## License

MIT
