/**
 * Request hooks for express-jsx-core
 *
 * These hooks provide access to request data within route handlers.
 * They use AsyncLocalStorage under the hood to maintain request context.
 */

import type { ZodType, infer as ZodInfer, SafeParseReturnType } from "zod";
import type { Request } from "../types.js";
import { getRequestContext } from "../context.js";

/**
 * Get the current request object
 */
export function useRequest(): Request {
  const ctx = getRequestContext();
  if (!ctx) {
    throw new Error("useRequest must be called within a request handler");
  }
  return ctx.request;
}

/**
 * Get validated URL params
 */
export function useParams<T extends ZodType>(schema: T): ZodInfer<T> {
  const req = useRequest();
  const result = schema.safeParse(req.params);
  if (!result.success) {
    throw new ValidationError("params", result.error);
  }
  return result.data;
}

/**
 * Get validated query string params
 */
export function useQuery<T extends ZodType>(schema: T): ZodInfer<T> {
  const req = useRequest();
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new ValidationError("query", result.error);
  }
  return result.data;
}

/**
 * Get validated request body
 */
export function useBody<T extends ZodType>(schema: T): ZodInfer<T> {
  const req = useRequest();
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ValidationError("body", result.error);
  }
  return result.data;
}

/**
 * Get request body with safe parsing (returns result object)
 */
export function useBodySafe<T extends ZodType>(
  schema: T,
): SafeParseReturnType<unknown, ZodInfer<T>> {
  const req = useRequest();
  return schema.safeParse(req.body);
}

/**
 * Get a specific header value
 */
export function useHeader(name: string): string | undefined {
  const req = useRequest();
  return req.headers[name.toLowerCase()];
}

/**
 * Validation error thrown when request data doesn't match schema
 */
export class ValidationError extends Error {
  constructor(
    public readonly source: "params" | "query" | "body",
    public readonly zodError: unknown,
  ) {
    super(`Validation failed for ${source}`);
    this.name = "ValidationError";
  }
}
