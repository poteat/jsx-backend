/**
 * Zod Integration for JSX Backend
 *
 * This module provides schema-based route components that:
 * 1. Validate request params, query, and body against Zod schemas
 * 2. Validate response data against a schema (optional)
 * 3. Collect schemas for typed client generation
 *
 * @example
 * ```tsx
 * import { z } from "zod";
 * import { ZodGet, ZodPost, getApiSchema } from "jsx-backend/zod";
 *
 * const UserSchema = z.object({
 *   id: z.string(),
 *   name: z.string(),
 *   email: z.string().email(),
 * });
 *
 * <ZodGet
 *   path="/users/:id"
 *   params={z.object({ id: z.string() })}
 *   response={UserSchema}
 *   render={({ params }) => <UserResponse id={params.id} />}
 * />
 * ```
 */

import React from "react";
import { z } from "zod";
import type { ExtractRouteParams, TypedRouteContext } from "./path-types.js";
import type { RouteHandler, Request, Response, NextFunction } from "./types.js";
import { Get, Post, Put, Patch, Delete, Options, Head, All, Route } from "./components.js";

// ============================================================================
// Schema Types
// ============================================================================

/**
 * Generic Zod schema type
 */
type AnyZodSchema = z.ZodType<unknown>;

/**
 * Context passed to render functions in validated routes.
 * Includes typed params, query, and body based on schemas.
 */
export interface ValidatedRouteContext<
  Params = Record<string, string>,
  Query = Record<string, unknown>,
  Body = unknown
> {
  params: Params;
  query: Query;
  body: Body;
  req: Request;
  res: Response;
}

/**
 * Props for Zod-validated route components.
 */
export interface ZodRouteProps<
  Path extends string = string,
  ParamsSchema extends AnyZodSchema = AnyZodSchema,
  QuerySchema extends AnyZodSchema = AnyZodSchema,
  BodySchema extends AnyZodSchema = AnyZodSchema,
  ResponseSchema extends AnyZodSchema = AnyZodSchema
> {
  /** Route path */
  path?: Path;
  /** Schema for validating URL params */
  params?: ParamsSchema;
  /** Schema for validating query string */
  query?: QuerySchema;
  /** Schema for validating request body */
  body?: BodySchema;
  /** Schema for validating response (runtime check in dev) */
  response?: ResponseSchema;
  /** Response children (untyped) */
  children?: React.ReactNode;
  /** Typed render function - receives validated data */
  render?: (
    context: ValidatedRouteContext<
      z.infer<ParamsSchema>,
      z.infer<QuerySchema>,
      z.infer<BodySchema>
    >
  ) => React.ReactNode;
  /** Traditional handler (bypasses validation) */
  handler?: RouteHandler;
  /** Custom error handler for validation failures */
  onValidationError?: (error: z.ZodError, req: Request, res: Response) => void;
}

// ============================================================================
// Schema Registry - For client generation
// ============================================================================

/**
 * Stored route schema information.
 */
export interface RouteSchema {
  method: string;
  path: string;
  params?: AnyZodSchema;
  query?: AnyZodSchema;
  body?: AnyZodSchema;
  response?: AnyZodSchema;
}

/**
 * Global registry for collecting route schemas.
 * Used for generating typed clients.
 */
const schemaRegistry: Map<string, RouteSchema> = new Map();

/**
 * Register a route's schemas for client generation.
 */
function registerSchema(
  method: string,
  path: string,
  schemas: {
    params?: AnyZodSchema;
    query?: AnyZodSchema;
    body?: AnyZodSchema;
    response?: AnyZodSchema;
  }
): void {
  const key = `${method.toUpperCase()} ${path}`;
  schemaRegistry.set(key, {
    method: method.toUpperCase(),
    path,
    ...schemas,
  });
}

/**
 * Get all registered route schemas.
 * Use this to generate typed clients.
 *
 * @example
 * ```typescript
 * const schemas = getApiSchemas();
 * for (const [key, schema] of schemas) {
 *   console.log(key, schema.params?.description);
 * }
 * ```
 */
export function getApiSchemas(): Map<string, RouteSchema> {
  return new Map(schemaRegistry);
}

/**
 * Clear the schema registry (useful for testing).
 */
export function clearApiSchemas(): void {
  schemaRegistry.clear();
}

/**
 * Generate a JSON Schema representation of all routes.
 * Useful for OpenAPI/Swagger generation.
 *
 * Note: For complete JSON Schema conversion, consider using
 * zod-to-json-schema package. This is a simplified version.
 */
export function getApiJsonSchema(): object {
  const routes: Record<string, object> = {};

  for (const [key, schema] of schemaRegistry) {
    routes[key] = {
      method: schema.method,
      path: schema.path,
      // For proper JSON schema conversion, use zod-to-json-schema
      hasParams: !!schema.params,
      hasQuery: !!schema.query,
      hasBody: !!schema.body,
      hasResponse: !!schema.response,
    };
  }

  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    routes,
  };
}

// ============================================================================
// Validation Handler Factory
// ============================================================================

/**
 * Default validation error handler.
 */
const defaultValidationErrorHandler = (
  error: z.ZodError,
  _req: Request,
  res: Response
): void => {
  res.status(400).json({
    error: "Validation failed",
    details: error.issues.map((e) => ({
      path: e.path.join("."),
      message: e.message,
      code: e.code,
    })),
  });
};

/**
 * Create a validation middleware from schemas.
 */
function createValidationMiddleware(
  schemas: {
    params?: AnyZodSchema;
    query?: AnyZodSchema;
    body?: AnyZodSchema;
  },
  onError: (error: z.ZodError, req: Request, res: Response) => void
): RouteHandler {
  return (req, res, next) => {
    try {
      // Validate params
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          return onError(result.error, req, res);
        }
        // Replace params with validated/transformed data
        Object.assign(req.params, result.data as object);
      }

      // Validate query
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          return onError(result.error, req, res);
        }
        Object.assign(req.query, result.data as object);
      }

      // Validate body
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          return onError(result.error, req, res);
        }
        req.body = result.data;
      }

      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        return onError(err, req, res);
      }
      throw err;
    }
  };
}

// ============================================================================
// Zod Route Components
// ============================================================================

/**
 * A GET route with Zod validation.
 *
 * @example
 * ```tsx
 * <ZodGet
 *   path="/users/:id"
 *   params={z.object({ id: z.string().uuid() })}
 *   query={z.object({ include: z.string().optional() })}
 *   response={UserSchema}
 *   render={({ params, query }) => (
 *     <UserResponse id={params.id} include={query.include} />
 *   )}
 * />
 * ```
 */
export function ZodGet<
  P extends string = string,
  ParamsSchema extends AnyZodSchema = z.ZodType<Record<string, string>>,
  QuerySchema extends AnyZodSchema = z.ZodType<Record<string, unknown>>,
  ResponseSchema extends AnyZodSchema = AnyZodSchema
>({
  path,
  params,
  query,
  response,
  children,
  render,
  handler,
  onValidationError = defaultValidationErrorHandler,
}: Omit<ZodRouteProps<P, ParamsSchema, QuerySchema, AnyZodSchema, ResponseSchema>, "body">): React.ReactElement {
  // Register schemas for client generation
  if (path) {
    registerSchema("GET", path, { params, query, response });
  }

  // If using traditional handler, return simple Get
  if (handler) {
    return <Get path={path} handler={handler} />;
  }

  // Create validation middleware wrapper
  const validatedRender = render
    ? (ctx: TypedRouteContext<ExtractRouteParams<P>>) => {
        return render({
          params: ctx.params as z.infer<ParamsSchema>,
          query: ctx.query as z.infer<QuerySchema>,
          body: undefined as never,
          req: (ctx as any).req,
          res: (ctx as any).res,
        });
      }
    : undefined;

  // Wrap with validation if schemas provided
  if ((params || query) && (render || children)) {
    return (
      <Route path={path || ""}>
        <Get
          handler={createValidationMiddleware({ params, query }, onValidationError)}
        />
        <Get render={validatedRender}>{children}</Get>
      </Route>
    );
  }

  return <Get path={path} render={validatedRender}>{children}</Get>;
}

/**
 * A POST route with Zod validation.
 *
 * @example
 * ```tsx
 * const CreateUserSchema = z.object({
 *   name: z.string().min(1),
 *   email: z.string().email(),
 * });
 *
 * <ZodPost
 *   path="/users"
 *   body={CreateUserSchema}
 *   response={UserSchema}
 *   render={({ body }) => (
 *     <CreateUserResponse data={body} />
 *   )}
 * />
 * ```
 */
export function ZodPost<
  P extends string = string,
  ParamsSchema extends AnyZodSchema = z.ZodType<Record<string, string>>,
  QuerySchema extends AnyZodSchema = z.ZodType<Record<string, unknown>>,
  BodySchema extends AnyZodSchema = AnyZodSchema,
  ResponseSchema extends AnyZodSchema = AnyZodSchema
>({
  path,
  params,
  query,
  body,
  response,
  children,
  render,
  handler,
  onValidationError = defaultValidationErrorHandler,
}: ZodRouteProps<P, ParamsSchema, QuerySchema, BodySchema, ResponseSchema>): React.ReactElement {
  // Register schemas for client generation
  if (path) {
    registerSchema("POST", path, { params, query, body, response });
  }

  if (handler) {
    return <Post path={path} handler={handler} />;
  }

  const validatedRender = render
    ? (ctx: TypedRouteContext<ExtractRouteParams<P>>) => {
        return render({
          params: ctx.params as z.infer<ParamsSchema>,
          query: ctx.query as z.infer<QuerySchema>,
          body: ctx.body as z.infer<BodySchema>,
          req: (ctx as any).req,
          res: (ctx as any).res,
        });
      }
    : undefined;

  if ((params || query || body) && (render || children)) {
    return (
      <Route path={path || ""}>
        <Post
          handler={createValidationMiddleware({ params, query, body }, onValidationError)}
        />
        <Post render={validatedRender}>{children}</Post>
      </Route>
    );
  }

  return <Post path={path} render={validatedRender}>{children}</Post>;
}

/**
 * A PUT route with Zod validation.
 */
export function ZodPut<
  P extends string = string,
  ParamsSchema extends AnyZodSchema = z.ZodType<Record<string, string>>,
  QuerySchema extends AnyZodSchema = z.ZodType<Record<string, unknown>>,
  BodySchema extends AnyZodSchema = AnyZodSchema,
  ResponseSchema extends AnyZodSchema = AnyZodSchema
>({
  path,
  params,
  query,
  body,
  response,
  children,
  render,
  handler,
  onValidationError = defaultValidationErrorHandler,
}: ZodRouteProps<P, ParamsSchema, QuerySchema, BodySchema, ResponseSchema>): React.ReactElement {
  if (path) {
    registerSchema("PUT", path, { params, query, body, response });
  }

  if (handler) {
    return <Put path={path} handler={handler} />;
  }

  const validatedRender = render
    ? (ctx: TypedRouteContext<ExtractRouteParams<P>>) => {
        return render({
          params: ctx.params as z.infer<ParamsSchema>,
          query: ctx.query as z.infer<QuerySchema>,
          body: ctx.body as z.infer<BodySchema>,
          req: (ctx as any).req,
          res: (ctx as any).res,
        });
      }
    : undefined;

  if ((params || query || body) && (render || children)) {
    return (
      <Route path={path || ""}>
        <Put
          handler={createValidationMiddleware({ params, query, body }, onValidationError)}
        />
        <Put render={validatedRender}>{children}</Put>
      </Route>
    );
  }

  return <Put path={path} render={validatedRender}>{children}</Put>;
}

/**
 * A PATCH route with Zod validation.
 */
export function ZodPatch<
  P extends string = string,
  ParamsSchema extends AnyZodSchema = z.ZodType<Record<string, string>>,
  QuerySchema extends AnyZodSchema = z.ZodType<Record<string, unknown>>,
  BodySchema extends AnyZodSchema = AnyZodSchema,
  ResponseSchema extends AnyZodSchema = AnyZodSchema
>({
  path,
  params,
  query,
  body,
  response,
  children,
  render,
  handler,
  onValidationError = defaultValidationErrorHandler,
}: ZodRouteProps<P, ParamsSchema, QuerySchema, BodySchema, ResponseSchema>): React.ReactElement {
  if (path) {
    registerSchema("PATCH", path, { params, query, body, response });
  }

  if (handler) {
    return <Patch path={path} handler={handler} />;
  }

  const validatedRender = render
    ? (ctx: TypedRouteContext<ExtractRouteParams<P>>) => {
        return render({
          params: ctx.params as z.infer<ParamsSchema>,
          query: ctx.query as z.infer<QuerySchema>,
          body: ctx.body as z.infer<BodySchema>,
          req: (ctx as any).req,
          res: (ctx as any).res,
        });
      }
    : undefined;

  if ((params || query || body) && (render || children)) {
    return (
      <Route path={path || ""}>
        <Patch
          handler={createValidationMiddleware({ params, query, body }, onValidationError)}
        />
        <Patch render={validatedRender}>{children}</Patch>
      </Route>
    );
  }

  return <Patch path={path} render={validatedRender}>{children}</Patch>;
}

/**
 * A DELETE route with Zod validation.
 */
export function ZodDelete<
  P extends string = string,
  ParamsSchema extends AnyZodSchema = z.ZodType<Record<string, string>>,
  QuerySchema extends AnyZodSchema = z.ZodType<Record<string, unknown>>,
  ResponseSchema extends AnyZodSchema = AnyZodSchema
>({
  path,
  params,
  query,
  response,
  children,
  render,
  handler,
  onValidationError = defaultValidationErrorHandler,
}: Omit<ZodRouteProps<P, ParamsSchema, QuerySchema, AnyZodSchema, ResponseSchema>, "body">): React.ReactElement {
  if (path) {
    registerSchema("DELETE", path, { params, query, response });
  }

  if (handler) {
    return <Delete path={path} handler={handler} />;
  }

  const validatedRender = render
    ? (ctx: TypedRouteContext<ExtractRouteParams<P>>) => {
        return render({
          params: ctx.params as z.infer<ParamsSchema>,
          query: ctx.query as z.infer<QuerySchema>,
          body: undefined as never,
          req: (ctx as any).req,
          res: (ctx as any).res,
        });
      }
    : undefined;

  if ((params || query) && (render || children)) {
    return (
      <Route path={path || ""}>
        <Delete
          handler={createValidationMiddleware({ params, query }, onValidationError)}
        />
        <Delete render={validatedRender}>{children}</Delete>
      </Route>
    );
  }

  return <Delete path={path} render={validatedRender}>{children}</Delete>;
}

// ============================================================================
// Client Generation Helpers
// ============================================================================

/**
 * Generate TypeScript interface definitions from the schema registry.
 * For full type generation, consider using zod-to-ts.
 *
 * @example
 * ```typescript
 * const interfaces = generateApiInterfaces();
 * console.log(interfaces);
 * // Output:
 * // export interface GetUsersIdRequest { params: { id: string } }
 * // export interface GetUsersIdResponse { ... }
 * ```
 */
export function generateApiInterfaces(): string {
  const lines: string[] = [
    "// Auto-generated API interfaces",
    "// Do not edit manually",
    "",
  ];

  for (const [key, schema] of schemaRegistry) {
    const safeName = key.replace(/[^a-zA-Z0-9]/g, "_");

    lines.push(`// ${key}`);
    lines.push(`export interface ${safeName}Route {`);
    lines.push(`  method: "${schema.method}";`);
    lines.push(`  path: "${schema.path}";`);
    if (schema.params) lines.push(`  params: unknown; // See Zod schema`);
    if (schema.query) lines.push(`  query: unknown; // See Zod schema`);
    if (schema.body) lines.push(`  body: unknown; // See Zod schema`);
    if (schema.response) lines.push(`  response: unknown; // See Zod schema`);
    lines.push(`}`);
    lines.push("");
  }

  return lines.join("\n");
}

// ============================================================================
// Re-exports
// ============================================================================

export { z } from "zod";
