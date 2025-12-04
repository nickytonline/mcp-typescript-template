import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSamplingContext, SAMPLING_DEFAULTS } from "./sampling.ts";
import {
  SamplingNotSupportedError,
  SamplingTimeoutError,
  SamplingTransportError,
  SamplingValidationError,
} from "../types/sampling.ts";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

describe("sampling", () => {
  describe("createSamplingContext", () => {
    let mockServer: Server;

    beforeEach(() => {
      // Create a minimal mock server with createMessage
      mockServer = {
        createMessage: vi.fn(),
      } as unknown as Server;
    });

    it("should create a sampling context with sample method", () => {
      const context = createSamplingContext(mockServer);

      expect(context).toHaveProperty("sample");
      expect(typeof context.sample).toBe("function");
    });

    it("should use default options when not provided", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "text", text: "Test response" },
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

      const context = createSamplingContext(mockServer);
      const result = await context.sample({
        prompt: "Test prompt",
      });

      expect(result.content).toBe("Test response");
      expect(mockServer.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: SAMPLING_DEFAULTS.MAX_TOKENS,
          temperature: SAMPLING_DEFAULTS.TEMPERATURE,
        }),
      );
    });

    it("should use custom options when provided", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "text", text: "Test response" },
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

      const context = createSamplingContext(mockServer, {
        timeout_ms: 60000,
        log_requests: false,
      });

      await context.sample({
        prompt: "Test",
        temperature: 0.7,
        max_tokens: 500,
      });

      expect(mockServer.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          maxTokens: 500,
        }),
      );
    });

    it("should validate request before sending", async () => {
      const context = createSamplingContext(mockServer);

      // Invalid temperature
      await expect(
        context.sample({
          prompt: "Test",
          temperature: 1.5,
        }),
      ).rejects.toThrow(SamplingValidationError);

      // Invalid max_tokens
      await expect(
        context.sample({
          prompt: "Test",
          max_tokens: -1,
        }),
      ).rejects.toThrow(SamplingValidationError);

      // Empty prompt
      await expect(
        context.sample({
          prompt: "",
        }),
      ).rejects.toThrow(SamplingValidationError);
    });

    it("should handle successful responses", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "text", text: "Summary of the document" },
        model: "claude-3-5-sonnet",
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

      const context = createSamplingContext(mockServer);
      const result = await context.sample({
        prompt: "Summarize this document",
        temperature: 0.3,
      });

      expect(result.content).toBe("Summary of the document");
      expect(result.model).toBe("claude-3-5-sonnet");
      expect(result.finish_reason).toBe("stop");
    });

    it("should map stopReason correctly", async () => {
      const testCases = [
        { stopReason: "endTurn", expected: "stop" },
        { stopReason: "maxTokens", expected: "length" },
        { stopReason: "stopSequence", expected: "stop" },
      ] as const;

      for (const { stopReason, expected } of testCases) {
        const mockResponse = {
          role: "assistant",
          content: { type: "text", text: "Response" },
          stopReason,
        };

        vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

        const context = createSamplingContext(mockServer);
        const result = await context.sample({ prompt: "Test" });

        expect(result.finish_reason).toBe(expected);
      }
    });

    it("should handle timeout errors", async () => {
      // Mock a slow response
      vi.mocked(mockServer.createMessage).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                role: "assistant",
                content: { type: "text", text: "Too late" },
                stopReason: "endTurn",
              });
            }, 100);
          }),
      );

      const context = createSamplingContext(mockServer, {
        timeout_ms: 50, // Very short timeout
      });

      await expect(
        context.sample({ prompt: "Test" }),
      ).rejects.toThrow(SamplingTimeoutError);
    });

    it("should throw SamplingNotSupportedError for capability errors", async () => {
      vi.mocked(mockServer.createMessage).mockRejectedValueOnce(
        new Error("Sampling capability not supported"),
      );

      const context = createSamplingContext(mockServer);

      await expect(
        context.sample({ prompt: "Test" }),
      ).rejects.toThrow(SamplingNotSupportedError);
    });

    it("should wrap unknown errors in SamplingTransportError", async () => {
      vi.mocked(mockServer.createMessage).mockRejectedValueOnce(
        new Error("Network error"),
      );

      const context = createSamplingContext(mockServer);

      await expect(
        context.sample({ prompt: "Test" }),
      ).rejects.toThrow(SamplingTransportError);
    });

    it("should include system prompt when provided", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "text", text: "Response" },
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

      const context = createSamplingContext(mockServer);
      await context.sample({
        prompt: "Test",
        system_prompt: "You are a helpful assistant",
      });

      expect(mockServer.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: "You are a helpful assistant",
        }),
      );
    });

    it("should include stop sequences when provided", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "text", text: "Response" },
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

      const context = createSamplingContext(mockServer);
      await context.sample({
        prompt: "Test",
        stop_sequences: ["STOP", "END"],
      });

      expect(mockServer.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          stopSequences: ["STOP", "END"],
        }),
      );
    });

    it("should include model preferences when provided", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "text", text: "Response" },
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

      const context = createSamplingContext(mockServer);
      await context.sample({
        prompt: "Test",
        model_preferences: {
          costPriority: 0.8,
          speedPriority: 0.5,
          intelligencePriority: 0.7,
        },
      });

      expect(mockServer.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          modelPreferences: {
            costPriority: 0.8,
            speedPriority: 0.5,
            intelligencePriority: 0.7,
          },
        }),
      );
    });

    it("should handle non-text content types", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "image", url: "https://example.com/image.jpg" },
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse as any);

      const context = createSamplingContext(mockServer);

      await expect(
        context.sample({ prompt: "Test" }),
      ).rejects.toThrow("Unexpected content type");
    });

    it("should format messages correctly", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "text", text: "Response" },
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

      const context = createSamplingContext(mockServer);
      await context.sample({
        prompt: "Test prompt",
      });

      expect(mockServer.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: "Test prompt",
              },
            },
          ],
        }),
      );
    });

    it("should allow per-request option overrides", async () => {
      const mockResponse = {
        role: "assistant",
        content: { type: "text", text: "Response" },
        stopReason: "endTurn",
      };

      vi.mocked(mockServer.createMessage).mockResolvedValueOnce(mockResponse);

      const context = createSamplingContext(mockServer, {
        timeout_ms: 30000,
      });

      // Should not timeout because we override with longer timeout
      await expect(
        context.sample(
          { prompt: "Test" },
          { timeout_ms: 60000 },
        ),
      ).resolves.toBeDefined();
    });
  });

  describe("SAMPLING_DEFAULTS", () => {
    it("should have reasonable default values", () => {
      expect(SAMPLING_DEFAULTS.TEMPERATURE).toBe(0.5);
      expect(SAMPLING_DEFAULTS.MAX_TOKENS).toBe(1000);
      expect(SAMPLING_DEFAULTS.TIMEOUT_MS).toBe(30000);
      expect(SAMPLING_DEFAULTS.LOG_REQUESTS).toBe(true);
      expect(SAMPLING_DEFAULTS.LOG_USAGE).toBe(true);
    });
  });
});
