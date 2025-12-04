/**
 * Sampling types for MCP server-initiated AI content generation
 * Based on MCP Sampling specification and PRD requirements
 */

/**
 * Request parameters for sampling operation
 */
export interface SamplingRequest {
  /** The prompt to send to the AI for completion */
  prompt: string;

  /**
   * Temperature for sampling (0.0 = deterministic, 1.0 = creative)
   * @default 0.5
   */
  temperature?: number;

  /**
   * Maximum number of tokens to generate
   * @default 1000
   */
  max_tokens?: number;

  /** Optional system prompt to set context/instructions */
  system_prompt?: string;

  /** Stop sequences that will halt generation */
  stop_sequences?: string[];

  /**
   * Model preferences for the sampling request
   * Allows hinting at preferred model characteristics
   */
  model_preferences?: {
    /** Priority for cost optimization (0.0 to 1.0) */
    costPriority?: number;
    /** Priority for speed (0.0 to 1.0) */
    speedPriority?: number;
    /** Priority for intelligence/capability (0.0 to 1.0) */
    intelligencePriority?: number;
  };
}

/**
 * Response from a sampling operation
 */
export interface SamplingResponse {
  /** The generated content from the AI */
  content: string;

  /** The model used for generation (if provided by client) */
  model?: string;

  /** Reason why generation stopped */
  finish_reason?: "stop" | "length" | "content_filter" | "endTurn" | "stopSequence" | "maxTokens";

  /** Token usage information (if provided by client) */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Options for configuring sampling behavior
 */
export interface SamplingOptions {
  /** Timeout in milliseconds for sampling requests */
  timeout_ms?: number;

  /** Whether to log sampling requests (default: true) */
  log_requests?: boolean;

  /** Whether to include usage statistics in logs (default: true) */
  log_usage?: boolean;
}

/**
 * Context object passed to tool handlers with sampling capabilities
 */
export interface SamplingContext {
  /**
   * Request AI-generated content from the connected client
   * @param request Sampling request parameters
   * @param options Optional configuration for this specific request
   * @returns Promise resolving to the AI-generated response
   * @throws {SamplingNotSupportedError} If client doesn't support sampling
   * @throws {SamplingTimeoutError} If request times out
   * @throws {SamplingError} For other sampling-related errors
   */
  sample(request: SamplingRequest, options?: SamplingOptions): Promise<SamplingResponse>;
}

/**
 * Base error for all sampling-related errors
 */
export class SamplingError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "SamplingError";
    Object.setPrototypeOf(this, SamplingError.prototype);
  }
}

/**
 * Error thrown when the connected client doesn't support sampling
 */
export class SamplingNotSupportedError extends SamplingError {
  constructor(message = "The connected client does not support sampling") {
    super(message, "SAMPLING_NOT_SUPPORTED");
    this.name = "SamplingNotSupportedError";
    Object.setPrototypeOf(this, SamplingNotSupportedError.prototype);
  }
}

/**
 * Error thrown when a sampling request times out
 */
export class SamplingTimeoutError extends SamplingError {
  constructor(
    message = "Sampling request timed out",
    public readonly timeout_ms?: number,
  ) {
    super(message, "SAMPLING_TIMEOUT");
    this.name = "SamplingTimeoutError";
    Object.setPrototypeOf(this, SamplingTimeoutError.prototype);
  }
}

/**
 * Error thrown when sampling request validation fails
 */
export class SamplingValidationError extends SamplingError {
  constructor(
    message: string,
    public readonly field?: string,
  ) {
    super(message, "SAMPLING_VALIDATION_ERROR");
    this.name = "SamplingValidationError";
    Object.setPrototypeOf(this, SamplingValidationError.prototype);
  }
}

/**
 * Error thrown when the transport layer fails during sampling
 */
export class SamplingTransportError extends SamplingError {
  constructor(
    message: string,
    public readonly originalError?: unknown,
  ) {
    super(message, "SAMPLING_TRANSPORT_ERROR");
    this.name = "SamplingTransportError";
    Object.setPrototypeOf(this, SamplingTransportError.prototype);
  }
}
