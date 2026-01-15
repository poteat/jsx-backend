/**
 * Unified Input API for JSX Backend
 *
 * This module provides a simplified API where query params and body
 * are unified into a single "input" object. The route definition
 * specifies which fields are query params (for URL) vs body params.
 *
 * Benefits:
 * - Simpler API: render receives { params, input } instead of { params, query, body }
 * - Client generation: generated client accepts a single input object
 * - Flexibility: same schema works for GET (query) and POST (body)
 *
 * @example
 * ```tsx
 * const GetUsersInput = input({
 *   // Query params (appear in URL)
 *   page: z.number().optional(),
 *   limit: z.number().optional(),
 *   search: z.string().optional(),
 * });
 *
 * const CreateUserInput = input({
 *   name: z.string(),
 *   email: z.string().email(),
 * });
 *
 * // Server
 * <Endpoint
 *   method="get"
 *   path="/users"
 *   input={GetUsersInput}
 *   render={({ input }) => <UserList page={input.page} />}
 * />
 *
 * // Generated client usage:
 * const users = await api.getUsers({ page: 1, limit: 10 });
 * const user = await api.createUser({ name: "John", email: "john@example.com" });
 * ```
 */

import React from "react";
import { z } from "zod";
import type { ExtractRouteParams, TypedRouteContext } from "./path-types.js";
import type { RouteHandler, Request, Response } from "./types.js";
import { Get, Post, Put, Patch, Delete, Route } from "./components.js";

// ============================================================================
// Input Schema Types
// ============================================================================

/**
 * Input schema with metadata about which fields are query params.
 */
export interface InputSchema<T extends z.ZodRawShape = z.ZodRawShape> {
  schema: z.ZodObject<T>;
  queryKeys: Set<string>;
  _brand: "InputSchema";
}

/**
 * Create an input schema where all fields are treated as body params by default.
 * Use .query() to mark specific fields as query params.
 *
 * @example
 * ```tsx
 * // All fields in body (for POST/PUT/PATCH)
 * const CreateUserInput = input({
 *   name: z.string(),
 *   email: z.string().email(),
 * });
 *
 * // Mixed query and body
 * const UpdateUserInput = input({
 *   name: z.string().optional(),
 *   email: z.string().email().optional(),
 * }).query("returnNew"); // returnNew goes in query string
 *
 * // All fields in query (for GET)
 * const ListUsersInput = input({
 *   page: z.number().optional(),
 *   limit: z.number().optional(),
 *   search: z.string().optional(),
 * }).allQuery(); // All fields go in query string
 * ```
 */
export function input<T extends z.ZodRawShape>(
  shape: T
): InputSchemaBuilder<T> {
  return new InputSchemaBuilder(z.object(shape), new Set());
}

/**
 * Builder for input schemas with query/body field configuration.
 */
export class InputSchemaBuilder<T extends z.ZodRawShape> {
  constructor(
    private _schema: z.ZodObject<T>,
    private _queryKeys: Set<string>
  ) {}

  /**
   * Mark specific fields as query parameters.
   */
  query<K extends keyof T>(...keys: K[]): InputSchemaBuilder<T> {
    const newQueryKeys = new Set(this._queryKeys);
    for (const key of keys) {
      newQueryKeys.add(key as string);
    }
    return new InputSchemaBuilder(this._schema, newQueryKeys);
  }

  /**
   * Mark all fields as query parameters.
   * Useful for GET endpoints.
   */
  allQuery(): InputSchemaBuilder<T> {
    const allKeys = new Set(Object.keys(this._schema.shape));
    return new InputSchemaBuilder(this._schema, allKeys);
  }

  /**
   * Build the final input schema.
   */
  build(): InputSchema<T> {
    return {
      schema: this._schema,
      queryKeys: this._queryKeys,
      _brand: "InputSchema",
    };
  }

  /**
   * Get the underlying Zod schema for type inference.
   */
  get schema(): z.ZodObject<T> {
    return this._schema;
  }

  /**
   * Get the query keys set.
   */
  get queryKeys(): Set<string> {
    return this._queryKeys;
  }
}

// Allow InputSchemaBuilder to be used directly as InputSchema
type AnyInputSchema = InputSchema | InputSchemaBuilder<any>;

function resolveInputSchema(input: AnyInputSchema): InputSchema {
  if ("_brand" in input && input._brand === "InputSchema") {
    return input as InputSchema;
  }
  return (input as InputSchemaBuilder<any>).build();
}

// ============================================================================
// Endpoint Context
// ============================================================================

/**
 * Context passed to endpoint render functions.
 */
export interface EndpointContext<
  Params extends Record<string, string> = Record<string, string>,
  Input = unknown
> {
  /** URL path parameters (e.g., :id) */
  params: Params;
  /** Unified input (merged query + body, validated) */
  input: Input;
  /** Raw Express request (escape hatch) */
  req: Request;
  /** Raw Express response (escape hatch) */
  res: Response;
}

// ============================================================================
// Schema Registry for Client Generation
// ============================================================================

/**
 * Registered endpoint information.
 */
export interface EndpointSchema {
  method: string;
  path: string;
  params?: z.ZodType;
  input?: InputSchema;
  output?: z.ZodType;
}

const endpointRegistry: Map<string, EndpointSchema> = new Map();

function registerEndpoint(
  method: string,
  path: string,
  schemas: {
    params?: z.ZodType;
    input?: InputSchema;
    output?: z.ZodType;
  }
): void {
  const key = `${method.toUpperCase()} ${path}`;
  endpointRegistry.set(key, {
    method: method.toUpperCase(),
    path,
    ...schemas,
  });
}

/**
 * Get all registered endpoint schemas.
 */
export function getEndpointSchemas(): Map<string, EndpointSchema> {
  return new Map(endpointRegistry);
}

/**
 * Clear the endpoint registry.
 */
export function clearEndpointSchemas(): void {
  endpointRegistry.clear();
}

// ============================================================================
// Validation Middleware
// ============================================================================

const defaultErrorHandler = (
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
 * Create middleware that validates and merges query + body into input.
 */
function createInputValidationMiddleware(
  inputSchema: InputSchema,
  paramsSchema: z.ZodType | undefined,
  onError: (error: z.ZodError, req: Request, res: Response) => void
): RouteHandler {
  return (req, res, next) => {
    try {
      // Validate params if schema provided
      if (paramsSchema) {
        const result = paramsSchema.safeParse(req.params);
        if (!result.success) {
          return onError(result.error, req, res);
        }
        Object.assign(req.params, result.data as object);
      }

      // Merge query and body based on schema configuration
      const merged: Record<string, unknown> = {};

      // Get query params (converting string values as needed)
      for (const key of inputSchema.queryKeys) {
        if (req.query[key] !== undefined) {
          merged[key] = req.query[key];
        }
      }

      // Get body params (everything not in queryKeys)
      if (req.body && typeof req.body === "object") {
        for (const [key, value] of Object.entries(req.body)) {
          if (!inputSchema.queryKeys.has(key)) {
            merged[key] = value;
          }
        }
      }

      // Also check query for non-query fields (flexibility for GET requests)
      const shape = inputSchema.schema.shape;
      for (const key of Object.keys(shape)) {
        if (!inputSchema.queryKeys.has(key) && merged[key] === undefined) {
          if (req.query[key] !== undefined) {
            merged[key] = req.query[key];
          }
        }
      }

      // Validate merged input
      const result = inputSchema.schema.safeParse(merged);
      if (!result.success) {
        return onError(result.error, req, res);
      }

      // Store validated input on request
      (req as any).__validatedInput = result.data;

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
// Endpoint Component
// ============================================================================

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/**
 * Infer the input type from an InputSchema or InputSchemaBuilder.
 */
type InferInput<Input> = Input extends InputSchemaBuilder<infer S>
  ? z.infer<z.ZodObject<S>>
  : Input extends InputSchema<infer S>
  ? z.infer<z.ZodObject<S>>
  : unknown;

/**
 * Props for the unified Endpoint component.
 */
export interface EndpointProps<
  Path extends string = string,
  ParamsSchema extends z.ZodType = z.ZodType,
  Input extends AnyInputSchema = AnyInputSchema,
  Output extends z.ZodType = z.ZodType
> {
  /** HTTP method */
  method: HttpMethod;
  /** Route path */
  path: Path;
  /** Schema for URL params (e.g., :id) */
  params?: ParamsSchema;
  /** Unified input schema (query + body) */
  input?: Input;
  /** Output schema (for documentation/validation) */
  output?: Output;
  /** Render function - receives validated params and input */
  render: (
    context: EndpointContext<
      z.infer<ParamsSchema> extends Record<string, string> ? z.infer<ParamsSchema> : Record<string, string>,
      InferInput<Input>
    >
  ) => React.ReactNode;
  /** Custom validation error handler */
  onValidationError?: (error: z.ZodError, req: Request, res: Response) => void;
}

/**
 * Unified endpoint component that handles validation and routing.
 *
 * @example
 * ```tsx
 * <Endpoint
 *   method="get"
 *   path="/users"
 *   input={input({ page: z.number().optional(), limit: z.number().optional() }).allQuery()}
 *   render={({ input }) => (
 *     <UserList page={input.page} limit={input.limit} />
 *   )}
 * />
 *
 * <Endpoint
 *   method="post"
 *   path="/users"
 *   input={input({ name: z.string(), email: z.string().email() })}
 *   render={({ input }) => (
 *     <CreateUserResponse name={input.name} email={input.email} />
 *   )}
 * />
 * ```
 */
export function Endpoint<
  P extends string = string,
  ParamsSchema extends z.ZodType = z.ZodType,
  Input extends AnyInputSchema = InputSchemaBuilder<{}>,
  Output extends z.ZodType = z.ZodType
>({
  method,
  path,
  params,
  input: inputDef,
  output,
  render,
  onValidationError = defaultErrorHandler,
}: EndpointProps<P, ParamsSchema, Input, Output>): React.ReactElement {
  const inputSchema = inputDef ? resolveInputSchema(inputDef) : null;

  // Register for client generation
  registerEndpoint(method, path, {
    params,
    input: inputSchema || undefined,
    output,
  });

  // Create the render wrapper - ctx includes req/res from reconciler
  type ParamsType = z.infer<ParamsSchema> extends Record<string, string>
    ? z.infer<ParamsSchema>
    : Record<string, string>;

  const wrappedRender = (ctx: any) => {
    return render({
      params: ctx.params as ParamsType,
      input: (ctx.req as any)?.__validatedInput ?? {},
      req: ctx.req as Request,
      res: ctx.res as Response,
    });
  };

  // Select the right HTTP method component
  const MethodComponent = {
    get: Get,
    post: Post,
    put: Put,
    patch: Patch,
    delete: Delete,
  }[method];

  // If we have input validation, wrap with middleware
  if (inputSchema || params) {
    const validationMiddleware = createInputValidationMiddleware(
      inputSchema || { schema: z.object({}), queryKeys: new Set(), _brand: "InputSchema" },
      params,
      onValidationError
    );

    return (
      <Route path={path}>
        <MethodComponent handler={validationMiddleware} />
        <MethodComponent render={wrappedRender} />
      </Route>
    );
  }

  return <MethodComponent path={path} render={wrappedRender} />;
}

// ============================================================================
// Convenience Method Components
// ============================================================================

/**
 * GET endpoint with unified input (all fields are query params by default).
 */
export function GET<
  P extends string = string,
  ParamsSchema extends z.ZodType = z.ZodType,
  Input extends AnyInputSchema = InputSchemaBuilder<{}>,
  Output extends z.ZodType = z.ZodType
>(
  props: Omit<EndpointProps<P, ParamsSchema, Input, Output>, "method">
): React.ReactElement {
  // For GET, default all input fields to query params
  let inputDef = props.input;
  if (inputDef && inputDef instanceof InputSchemaBuilder && inputDef.queryKeys.size === 0) {
    inputDef = inputDef.allQuery() as Input;
  }
  return <Endpoint {...props} input={inputDef} method="get" />;
}

/**
 * POST endpoint with unified input (all fields are body params by default).
 */
export function POST<
  P extends string = string,
  ParamsSchema extends z.ZodType = z.ZodType,
  Input extends AnyInputSchema = InputSchemaBuilder<{}>,
  Output extends z.ZodType = z.ZodType
>(
  props: Omit<EndpointProps<P, ParamsSchema, Input, Output>, "method">
): React.ReactElement {
  return <Endpoint {...props} method="post" />;
}

/**
 * PUT endpoint with unified input.
 */
export function PUT<
  P extends string = string,
  ParamsSchema extends z.ZodType = z.ZodType,
  Input extends AnyInputSchema = InputSchemaBuilder<{}>,
  Output extends z.ZodType = z.ZodType
>(
  props: Omit<EndpointProps<P, ParamsSchema, Input, Output>, "method">
): React.ReactElement {
  return <Endpoint {...props} method="put" />;
}

/**
 * PATCH endpoint with unified input.
 */
export function PATCH<
  P extends string = string,
  ParamsSchema extends z.ZodType = z.ZodType,
  Input extends AnyInputSchema = InputSchemaBuilder<{}>,
  Output extends z.ZodType = z.ZodType
>(
  props: Omit<EndpointProps<P, ParamsSchema, Input, Output>, "method">
): React.ReactElement {
  return <Endpoint {...props} method="patch" />;
}

/**
 * DELETE endpoint with unified input.
 */
export function DELETE<
  P extends string = string,
  ParamsSchema extends z.ZodType = z.ZodType,
  Input extends AnyInputSchema = InputSchemaBuilder<{}>,
  Output extends z.ZodType = z.ZodType
>(
  props: Omit<EndpointProps<P, ParamsSchema, Input, Output>, "method">
): React.ReactElement {
  return <Endpoint {...props} method="delete" />;
}

// ============================================================================
// Client Generator
// ============================================================================

/**
 * Generate a typed API client from registered endpoints.
 *
 * @example
 * ```typescript
 * const clientCode = generateApiClient({
 *   baseUrl: "http://localhost:3000",
 *   name: "ApiClient",
 * });
 * fs.writeFileSync("./api-client.ts", clientCode);
 * ```
 */
export function generateApiClient(options: {
  baseUrl?: string;
  name?: string;
}): string {
  const { baseUrl = "", name = "ApiClient" } = options;

  const lines: string[] = [
    "// Auto-generated API client",
    "// Do not edit manually",
    "",
    'import { z } from "zod";',
    "",
    `const BASE_URL = "${baseUrl}";`,
    "",
    "type FetchOptions = {",
    "  headers?: Record<string, string>;",
    "  signal?: AbortSignal;",
    "};",
    "",
    "async function request<T>(",
    "  method: string,",
    "  path: string,",
    "  input?: Record<string, unknown>,",
    "  queryKeys?: Set<string>,",
    "  options?: FetchOptions",
    "): Promise<T> {",
    "  let url = BASE_URL + path;",
    "  let body: string | undefined;",
    "",
    "  if (input && queryKeys) {",
    "    const queryParams = new URLSearchParams();",
    "    const bodyObj: Record<string, unknown> = {};",
    "",
    "    for (const [key, value] of Object.entries(input)) {",
    "      if (value === undefined) continue;",
    "      if (queryKeys.has(key)) {",
    "        queryParams.set(key, String(value));",
    "      } else {",
    "        bodyObj[key] = value;",
    "      }",
    "    }",
    "",
    "    const qs = queryParams.toString();",
    "    if (qs) url += '?' + qs;",
    "    if (Object.keys(bodyObj).length > 0) {",
    "      body = JSON.stringify(bodyObj);",
    "    }",
    "  } else if (input) {",
    "    // All input goes to body (POST default)",
    "    body = JSON.stringify(input);",
    "  }",
    "",
    "  const res = await fetch(url, {",
    "    method,",
    '    headers: { "Content-Type": "application/json", ...options?.headers },',
    "    body,",
    "    signal: options?.signal,",
    "  });",
    "",
    "  if (!res.ok) {",
    "    throw new Error(`API error: ${res.status} ${res.statusText}`);",
    "  }",
    "",
    "  return res.json();",
    "}",
    "",
    `export const ${name} = {`,
  ];

  for (const [key, schema] of endpointRegistry) {
    const methodName = generateMethodName(schema.method, schema.path);
    const hasParams = schema.path.includes(":");
    const hasInput = !!schema.input;

    // Build function signature
    const args: string[] = [];
    if (hasParams) {
      args.push("params: Record<string, string>");
    }
    if (hasInput) {
      args.push("input: Record<string, unknown>");
    }
    args.push("options?: FetchOptions");

    // Build path substitution
    let pathExpr = `"${schema.path}"`;
    if (hasParams) {
      pathExpr = `"${schema.path}".replace(/:([^/]+)/g, (_, k) => params[k])`;
    }

    // Build query keys
    const queryKeysExpr = hasInput && schema.input
      ? `new Set(${JSON.stringify([...schema.input.queryKeys])})`
      : "undefined";

    lines.push(`  /** ${key} */`);
    lines.push(`  ${methodName}: async (${args.join(", ")}) => {`);
    lines.push(`    return request(`);
    lines.push(`      "${schema.method}",`);
    lines.push(`      ${pathExpr},`);
    lines.push(`      ${hasInput ? "input" : "undefined"},`);
    lines.push(`      ${queryKeysExpr},`);
    lines.push(`      options`);
    lines.push(`    );`);
    lines.push(`  },`);
    lines.push("");
  }

  lines.push("};");

  return lines.join("\n");
}

/**
 * Generate a method name from HTTP method and path.
 */
function generateMethodName(method: string, path: string): string {
  // /users/:id -> UsersId
  // /api/v1/posts -> ApiV1Posts
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((p) => {
      if (p.startsWith(":")) {
        return "By" + capitalize(p.slice(1));
      }
      return capitalize(p.replace(/[^a-zA-Z0-9]/g, ""));
    });

  return method.toLowerCase() + parts.join("");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================================
// Re-exports
// ============================================================================

export { z } from "zod";
