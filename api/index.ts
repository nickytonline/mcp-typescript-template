import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getConfig } from "../lib/config.js";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const config = getConfig();
  
  res.json({
    name: config.SERVER_NAME,
    version: config.SERVER_VERSION,
    description: "TypeScript template for building MCP servers (Vercel Serverless)",
    endpoints: {
      mcp: "/mcp",
      info: "/",
    },
    deployment: "vercel-serverless",
    documentation: "https://github.com/nickytonline/mcp-typescript-template",
  });
}
