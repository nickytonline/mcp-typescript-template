# Vercel Serverless Branch - Quick Reference

This branch converts the MCP TypeScript template into a Vercel-deployable serverless application.

## Key Changes

### New Files
- **`api/mcp.ts`** - Main MCP serverless function handler
- **`api/index.ts`** - Info endpoint serverless function
- **`vercel.json`** - Vercel platform configuration
- **`lib/`** - Shared libraries accessible to both src/ and api/
- **`README.vercel.md`** - Complete deployment guide

### Modified Files
- **`package.json`** - Added Vercel dependencies and scripts
- **`tsconfig.json`** - Updated to include api/ and lib/ directories
- **`.gitignore`** - Added `.vercel` directory

### Architecture Changes

```
┌─────────────────────────────────────────┐
│         Vercel Platform                  │
│  ┌────────────────────────────────────┐ │
│  │  Serverless Functions              │ │
│  │  ┌──────────────┐  ┌────────────┐ │ │
│  │  │ /api/index   │  │ /api/mcp   │ │ │
│  │  │  (GET)       │  │ (GET/POST) │ │ │
│  │  └──────────────┘  └────────────┘ │ │
│  │         │                  │       │ │
│  │         └──────┬───────────┘       │ │
│  │                │                   │ │
│  │         ┌──────▼──────┐           │ │
│  │         │   lib/      │           │ │
│  │         │  - config   │           │ │
│  │         │  - logger   │           │ │
│  │         │  - utils    │           │ │
│  │         └─────────────┘           │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

## Deploy Now

### Option 1: CLI
```bash
npm install
vercel
```

### Option 2: GitHub Integration
1. Connect repository to Vercel
2. Select the `vercel-serverless` branch
3. Deploy automatically

### Option 3: One-Click
Click the "Deploy with Vercel" button in README.vercel.md

## Local Development

```bash
# Install dependencies
npm install

# Run with Vercel dev environment (recommended)
npm run dev

# Or run traditional Express server
npm run dev:express
```

## Testing

```bash
# Test server info endpoint
curl http://localhost:3000/

# Test MCP initialization
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

## Important Notes

### Session Management
⚠️ **Critical Limitation**: In-memory session storage is NOT production-ready for serverless

The current implementation stores MCP sessions in memory, which has limitations:
- Sessions lost when function scales down
- Not shared across function instances
- Works for demos but NOT for production

**Production Solution**: Implement persistent storage
```typescript
// Example with Vercel KV
import { kv } from '@vercel/kv';

// Store session
await kv.set(`session:${sessionId}`, transportData);

// Retrieve session
const transportData = await kv.get(`session:${sessionId}`);
```

### Function Configuration
- **Runtime**: Node.js 22.x
- **Memory**: 1024 MB (adjustable)
- **Timeout**: 30 seconds (adjustable up to 5 min on Pro)
- **Cold Start**: ~300-500ms first request

### Cost Considerations
- Free tier: 100GB-hours compute, 100GB bandwidth
- Hobby plan: Unlimited, fair use
- Pro plan: Higher limits, better performance

## Troubleshooting

### "Module not found" errors
Ensure all imports use `.js` extensions:
```typescript
// ✅ Correct
import { createTextResult } from "../lib/utils.js";

// ❌ Wrong
import { createTextResult } from "../lib/utils";
```

### Session errors
If you see "Session not found":
1. The serverless function may have restarted
2. Implement persistent storage (see above)
3. Add session recovery logic

### Build failures
```bash
# Check TypeScript compilation
npm run build

# Check for errors
npm run lint
```

## Production Checklist

- [ ] Implement persistent session storage (Vercel KV/Redis)
- [ ] Set all environment variables in Vercel dashboard
- [ ] Enable error tracking (Sentry/Vercel)
- [ ] Add rate limiting
- [ ] Configure custom domain
- [ ] Set up monitoring/alerts
- [ ] Review function memory/timeout settings
- [ ] Test cold start performance
- [ ] Document API endpoints
- [ ] Set up CI/CD

## Next Steps

1. **Review README.vercel.md** for complete documentation
2. **Test locally** with `npm run dev`
3. **Deploy** with `vercel`
4. **Monitor** function logs in Vercel dashboard
5. **Iterate** based on real-world usage

## Questions?

- Check README.vercel.md for detailed documentation
- Review Vercel's serverless function docs
- Check MCP protocol documentation

## Reverting to Express

This branch maintains the original Express server in `src/index.ts`. To use it:

```bash
npm run dev:express
npm start  # for production
```

The Express version doesn't have the serverless limitations but requires traditional hosting.
