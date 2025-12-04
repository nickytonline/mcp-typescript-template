/**
 * Sampling implementation for MCP servers
 * Provides utilities for AI-powered content generation
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { logger } from "../logger.js";
import type {
  SamplingRequest,
  SamplingResponse,
  SamplingOptions,
  SamplingContext,
} from "../types/sampling.js";
import {
  SamplingError,
  SamplingNotSupportedError,
  SamplingTimeoutError,
  SamplingTransportError,
} from "../types/sampling.js";
import { validateSamplingRequest } from "./sampling-security.js";

/**
 * Default configuration for sampling operations
 */
export const SAMPLING_DEFAULTS = {
  TEMPERATURE: 0.5,
  MAX_TOKENS: 1000,
  TIMEOUT_MS: 30000, // 30 seconds
  LOG_REQUESTS: true,
  LOG_USAGE: true,
} as const;

/**
 * Creates a sampling context for tool handlers
 * This provides the ctx.sample() method that tools can use to request AI-generated content
 *
 * @param server The MCP server instance
 * @param defaultOptions Default options for sampling operations
 * @returns Sampling context object
 */
export function createSamplingContext(
  server: Server,
  defaultOptions?: Partial<SamplingOptions>,
): SamplingContext {
  const mergedDefaults: Required<SamplingOptions> = {
    timeout_ms: defaultOptions?.timeout_ms ?? SAMPLING_DEFAULTS.TIMEOUT_MS,
    log_requests: defaultOptions?.log_requests ?? SAMPLING_DEFAULTS.LOG_REQUESTS,
    log_usage: defaultOptions?.log_usage ?? SAMPLING_DEFAULTS.LOG_USAGE,
  };

  return {
    async sample(
      request: SamplingRequest,
      options?: SamplingOptions,
    ): Promise<SamplingResponse> {
      const startTime = Date.now();
      const requestId = generateRequestId();

      // Merge options
      const opts: Required<SamplingOptions> = {
        timeout_ms: options?.timeout_ms ?? mergedDefaults.timeout_ms,
        log_requests: options?.log_requests ?? mergedDefaults.log_requests,
        log_usage: options?.log_usage ?? mergedDefaults.log_usage,
      };

      // Validate request
      try {
        validateSamplingRequest(request);
      } catch (error) {
        if (opts.log_requests) {
          logger.error("Sampling validation failed", {
            requestId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw error;
      }

      // Log request initiation
      if (opts.log_requests) {
        logger.info("Sampling request initiated", {
          requestId,
          promptLength: request.prompt.length,
          temperature: request.temperature ?? SAMPLING_DEFAULTS.TEMPERATURE,
          maxTokens: request.max_tokens ?? SAMPLING_DEFAULTS.MAX_TOKENS,
          hasSystemPrompt: Boolean(request.system_prompt),
          hasModelPreferences: Boolean(request.model_preferences),
        });
      }

      try {
        // Create the sampling request using SDK's createMessage
        const result = await executeWithTimeout(
          performSampling(server, request),
          opts.timeout_ms,
        );

        const latency = Date.now() - startTime;

        // Log successful response
        if (opts.log_requests) {
          const logData: Record<string, unknown> = {
            requestId,
            responseLength: result.content.length,
            latencyMs: latency,
            finishReason: result.finish_reason,
            model: result.model,
          };

          if (opts.log_usage && result.usage) {
            logData.usage = result.usage;
          }

          logger.info("Sampling response received", logData);
        }

        return result;
      } catch (error) {
        const latency = Date.now() - startTime;

        if (opts.log_requests) {
          logger.error("Sampling request failed", {
            requestId,
            latencyMs: latency,
            error: error instanceof Error ? error.message : String(error),
            errorType: error instanceof Error ? error.constructor.name : typeof error,
          });
        }

        // Re-throw typed errors
        if (
          error instanceof SamplingError ||
          error instanceof SamplingNotSupportedError ||
          error instanceof SamplingTimeoutError
        ) {
          throw error;
        }

        // Wrap unknown errors
        throw new SamplingTransportError(
          error instanceof Error ? error.message : "Unknown sampling error",
          error,
        );
      }
    },
  };
}

/**
 * Performs the actual sampling request using the MCP SDK
 * @param server MCP server instance
 * @param request Sampling request parameters
 * @returns Sampling response
 */
async function performSampling(
  server: Server,
  request: SamplingRequest,
): Promise<SamplingResponse> {
  try {
    // Build the messages array for the SDK
    const messages = [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: request.prompt,
        },
      },
    ];

    // Build model preferences if provided
    const modelPreferences = request.model_preferences
      ? {
          costPriority: request.model_preferences.costPriority,
          speedPriority: request.model_preferences.speedPriority,
          intelligencePriority: request.model_preferences.intelligencePriority,
        }
      : undefined;

    // Call the SDK's createMessage method
    const result = await server.createMessage({
      messages,
      modelPreferences,
      systemPrompt: request.system_prompt,
      maxTokens: request.max_tokens ?? SAMPLING_DEFAULTS.MAX_TOKENS,
      temperature: request.temperature ?? SAMPLING_DEFAULTS.TEMPERATURE,
      stopSequences: request.stop_sequences,
    });

    // Extract text content from the response
    let content = "";
    if (result.content.type === "text") {
      content = result.content.text;
    } else {
      throw new SamplingError(
        `Unexpected content type: ${result.content.type}`,
        "UNEXPECTED_CONTENT_TYPE",
      );
    }

    // Map stop reason to our interface
    let finishReason: SamplingResponse["finish_reason"] = "stop";
    if (result.stopReason === "maxTokens") {
      finishReason = "length";
    } else if (result.stopReason === "stopSequence") {
      finishReason = "stop";
    } else if (result.stopReason === "endTurn") {
      finishReason = "stop";
    }

    return {
      content,
      model: result.model,
      finish_reason: finishReason,
      // Note: SDK doesn't currently return token usage in createMessage response
      // This could be added in future SDK versions
    };
  } catch (error) {
    // Check for specific error patterns
    if (error instanceof Error) {
      if (
        error.message.includes("not supported") ||
        error.message.includes("capability")
      ) {
        throw new SamplingNotSupportedError(error.message);
      }
    }

    throw error;
  }
}

/**
 * Executes a promise with a timeout
 * @param promise Promise to execute
 * @param timeoutMs Timeout in milliseconds
 * @returns Promise result
 * @throws {SamplingTimeoutError} If the promise times out
 */
async function executeWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new SamplingTimeoutError(
          `Sampling request timed out after ${timeoutMs}ms`,
          timeoutMs,
        ));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Generates a unique request ID for correlation
 * @returns Request ID string
 */
function generateRequestId(): string {
  return `sampling-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Helper function to create a sampling context with default settings
 * Convenience wrapper around createSamplingContext
 *
 * @param server The MCP server instance
 * @returns Sampling context
 */
export function createDefaultSamplingContext(server: Server): SamplingContext {
  return createSamplingContext(server);
}
