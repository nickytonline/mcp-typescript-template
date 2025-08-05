import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Creates a CallToolResult with text content from any data
 * Handles undefined values gracefully by converting them to null
 * @param data - The data to stringify and include in the result
 * @returns A properly formatted CallToolResult
 */
export function createTextResult(data: unknown): CallToolResult {
  // Handle undefined gracefully by converting to null
  const safeData = data === undefined ? null : data;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(safeData, null, 2),
      },
    ],
  };
}
