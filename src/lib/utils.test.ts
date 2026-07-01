import { describe, it, expect } from "vitest";
import { createErrorResult, createTextResult } from "./utils.ts";

describe("createTextResult", () => {
  // Mock data for testing
  const mockData = {
    echo: "Hello world",
    timestamp: Date.now(),
  };

  it("should create a CallToolResult with correct structure", () => {
    const result = createTextResult(mockData);
    const item = result.content[0];

    expect(result).toHaveProperty("content");
    expect(result.content).toHaveLength(1);
    expect(item).toHaveProperty("type", "text");
    expect(item).toHaveProperty("text");
    if (item.type === "text") {
      expect(typeof item.text).toBe("string");
    }
  });

  it("should handle mock data correctly", () => {
    const result = createTextResult(mockData);
    const item = result.content[0];

    expect(item.type).toBe("text");
    if (item.type === "text") {
      expect(item.text).toContain('"echo": "Hello world"');
    }
  });

  it("should handle null data", () => {
    const result = createTextResult(null);
    const item = result.content[0];

    expect(item.type).toBe("text");
    if (item.type === "text") {
      expect(item.text).toBe("null");
    }
  });

  it("should handle undefined data gracefully by converting to null", () => {
    const result = createTextResult(undefined);
    const item = result.content[0];

    expect(item.type).toBe("text");
    if (item.type === "text") {
      expect(item.text).toBe("null");
    }
  });

  it("should attach structuredContent for object payloads", () => {
    const result = createTextResult(mockData);
    expect(result.structuredContent).toEqual(mockData);
  });

  it("should not attach structuredContent for non-object payloads", () => {
    expect(createTextResult(null).structuredContent).toBeUndefined();
    expect(createTextResult("plain string").structuredContent).toBeUndefined();
  });

  it("should not flag success results as errors", () => {
    expect(createTextResult(mockData).isError).toBeFalsy();
  });
});

describe("createErrorResult", () => {
  it("flags the result as an error while keeping the text/structured payload", () => {
    const result = createErrorResult({ error: "boom" });
    const item = result.content[0];

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ error: "boom" });
    if (item.type === "text") {
      expect(item.text).toContain('"error": "boom"');
    }
  });
});
