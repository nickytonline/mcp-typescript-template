import { describe, it, expect } from "vitest";
import { createTextResult } from "./utils.ts";

describe("createTextResult", () => {
  // Mock data for testing
  const mockData = {
    echo: "Hello world",
    timestamp: Date.now(),
  };

  it("should create a CallToolResult with correct structure", () => {
    const result = createTextResult(mockData);

    expect(result).toHaveProperty("content");
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(result.content[0]).toHaveProperty("text");
    expect(typeof result.content[0].text).toBe("string");
  });

  it("should handle mock data correctly", () => {
    const result = createTextResult(mockData);

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toContain('"echo": "Hello world"');
  });

  it("should handle null data", () => {
    const result = createTextResult(null);

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("null");
  });

  it("should handle undefined data gracefully by converting to null", () => {
    const result = createTextResult(undefined);

    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("null");
  });
});
