import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Creates a successful CallToolResult from any data.
 *
 * The same data is returned two ways, per the MCP 2025-06-18 spec:
 *   - `content`: a human/legacy-client readable text block (the fallback).
 *   - `structuredContent`: the raw object for clients that declare an
 *     `outputSchema`. When a tool declares an outputSchema, the SDK
 *     validates this field against it.
 * The spec requires that a tool returning structured content SHOULD also
 * return the serialized JSON as a text block — which is why we emit both.
 * See: https://modelcontextprotocol.io/specification/2025-06-18/server/tools#structured-content
 *
 * Handles undefined values gracefully by converting them to null.
 * @param data - The data to include in the result
 * @returns A properly formatted CallToolResult
 */
export function createTextResult(data: unknown): CallToolResult {
  // Handle undefined gracefully by converting to null
  const safeData = data === undefined ? null : data;

  const result: CallToolResult = {
    content: [
      {
        type: "text",
        text: JSON.stringify(safeData, null, 2),
      },
    ],
  };

  // Only objects can satisfy an outputSchema (JSON Schema `type: "object"`),
  // so we only attach structuredContent for object payloads.
  if (safeData !== null && typeof safeData === "object") {
    result.structuredContent = safeData as Record<string, unknown>;
  }

  return result;
}

/**
 * Creates a failed CallToolResult with `isError: true`.
 *
 * Per the MCP spec, tool *execution* errors should be reported in-band with
 * `isError: true` (not thrown), so the model/client can distinguish a failure
 * from a normal result and react to it. Reserve this for genuine failures —
 * outcomes like a user declining or cancelling an elicitation are valid
 * results and should use createTextResult instead.
 * See: https://modelcontextprotocol.io/specification/2025-06-18/server/tools#error-handling
 * @param data - The error payload to include in the result
 * @returns A CallToolResult flagged as an error
 */
export function createErrorResult(data: unknown): CallToolResult {
  return { ...createTextResult(data), isError: true };
}
