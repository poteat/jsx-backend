import React, { ReactNode, ReactElement } from "react";
import type { Request, Response } from "express";
import type { ExtractRouteParams } from "./path-types.js";

// ============================================================================
// Request Context - Allows response components to access request data
// ============================================================================

export interface RequestContextValue {
  req: Request;
  res: Response;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
}

/**
 * Typed route context for render props.
 * Provides type-safe access to route parameters.
 */
export interface TypedRouteContext<Params extends Record<string, string> = Record<string, string>> {
  params: Params;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
  req: Request;
  res: Response;
}

/**
 * Synchronous context storage for the current request.
 * This is set during response rendering and cleared after.
 */
let currentRequestContext: RequestContextValue | null = null;

/**
 * Set the current request context (called by renderer)
 */
export function setRequestContext(ctx: RequestContextValue | null): void {
  currentRequestContext = ctx;
}

/**
 * Provider component (for API compatibility, just renders children)
 */
export function RequestProvider({
  value,
  children,
}: {
  value: RequestContextValue;
  children: ReactNode;
}): ReactElement {
  // The context is set synchronously before rendering, so we just pass through
  return <>{children}</>;
}

/**
 * Get the full request context
 */
export function useRequest(): RequestContextValue {
  if (!currentRequestContext) {
    throw new Error("useRequest must be used within a request handler");
  }
  return currentRequestContext;
}

/**
 * Get URL params (e.g., /users/:id -> { id: "123" })
 *
 * @example
 * ```typescript
 * // Basic usage - manually specify the type
 * const { id } = useParams<{ id: string }>();
 *
 * // Path-inferred usage (experimental)
 * const params = useParamsFromPath<"/users/:id">();
 * params.id // typed as string
 * ```
 */
export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useRequest().params as T;
}

/**
 * Get URL params with types inferred from a path literal.
 *
 * @example
 * ```typescript
 * const { userId, postId } = useParamsFromPath<"/users/:userId/posts/:postId">();
 * // Both userId and postId are typed as string
 * ```
 */
export function useParamsFromPath<Path extends string>(): ExtractRouteParams<Path> {
  return useRequest().params as ExtractRouteParams<Path>;
}

/**
 * Get query string params (e.g., ?page=1 -> { page: "1" })
 */
export function useQuery<T extends Record<string, string | string[] | undefined> = Record<string, string | string[] | undefined>>(): T {
  return useRequest().query as T;
}

/**
 * Get request body
 */
export function useBody<T = unknown>(): T {
  return useRequest().body as T;
}

/**
 * Get request headers
 */
export function useHeaders(): Request["headers"] {
  return useRequest().req.headers;
}

/**
 * Get a specific header
 */
export function useHeader(name: string): string | undefined {
  const headers = useHeaders();
  const value = headers[name.toLowerCase()];
  return globalThis.Array.isArray(value) ? value[0] : (value as string | undefined);
}

// ============================================================================
// Response Components - Build JSON responses declaratively
// ============================================================================

type ResponseNodeType =
  | "object"
  | "array"
  | "field"
  | "literal"
  | "status"
  | "header"
  | "redirect"
  | "empty";

/**
 * Mark a component as a response component
 */
function markResponseComponent<T extends (...args: any[]) => any>(
  component: T,
  type: ResponseNodeType
): T {
  (component as any).__responseType = type;
  return component;
}

// ============================================================================
// JSON Structure Components
// ============================================================================

export interface ObjectProps {
  children?: ReactNode;
}

/**
 * Renders as a JSON object. Children should be Field components.
 *
 * @example
 * ```tsx
 * <Object>
 *   <Field name="id">{user.id}</Field>
 *   <Field name="name">{user.name}</Field>
 * </Object>
 * // Renders: { "id": 1, "name": "Alice" }
 * ```
 */
export const Object = markResponseComponent(
  function Object({ children }: ObjectProps): ReactElement {
    // Return a special marker element that the renderer will recognize
    return React.createElement("response-object", null, children);
  },
  "object"
);

export interface ArrayProps {
  children?: ReactNode;
}

/**
 * Renders as a JSON array. Children become array elements.
 *
 * @example
 * ```tsx
 * <Array>
 *   {users.map(u => <Object key={u.id}>...</Object>)}
 * </Array>
 * // Renders: [{ ... }, { ... }]
 * ```
 */
export const Array = markResponseComponent(
  function Array({ children }: ArrayProps): ReactElement {
    return React.createElement("response-array", null, children);
  },
  "array"
);

export interface FieldProps {
  name: string;
  children?: ReactNode;
}

/**
 * A field within an Object. The name becomes the key.
 *
 * @example
 * ```tsx
 * <Object>
 *   <Field name="greeting">Hello</Field>
 * </Object>
 * // Renders: { "greeting": "Hello" }
 * ```
 */
export const Field = markResponseComponent(
  function Field({ name, children }: FieldProps): ReactElement {
    return React.createElement("response-field", { name }, children);
  },
  "field"
);

export interface LiteralProps {
  value: unknown;
}

/**
 * A literal JSON value (string, number, boolean, null).
 * Usually not needed as primitives are auto-converted.
 *
 * @example
 * ```tsx
 * <Literal value={42} />
 * <Literal value={null} />
 * <Literal value={{ pre: "computed" }} />
 * ```
 */
export const Literal = markResponseComponent(
  function Literal({ value }: LiteralProps): ReactElement {
    return React.createElement("response-literal", { value });
  },
  "literal"
);

// ============================================================================
// HTTP Response Components
// ============================================================================

export interface StatusProps {
  code: number;
  children?: ReactNode;
}

/**
 * Set the HTTP status code for the response.
 *
 * @example
 * ```tsx
 * <Status code={201}>
 *   <Object>
 *     <Field name="created">true</Field>
 *   </Object>
 * </Status>
 * ```
 */
export const Status = markResponseComponent(
  function Status({ code, children }: StatusProps): ReactElement {
    return React.createElement("response-status", { code }, children);
  },
  "status"
);

export interface HeaderProps {
  name: string;
  value: string;
  children?: ReactNode;
}

/**
 * Set a response header.
 *
 * @example
 * ```tsx
 * <Header name="X-Custom" value="hello">
 *   <Object>...</Object>
 * </Header>
 * ```
 */
export const Header = markResponseComponent(
  function Header({ name, value, children }: HeaderProps): ReactElement {
    return React.createElement("response-header", { name, value }, children);
  },
  "header"
);

export interface RedirectProps {
  to: string;
  permanent?: boolean;
}

/**
 * Send a redirect response.
 *
 * @example
 * ```tsx
 * <Redirect to="/new-location" />
 * <Redirect to="/moved" permanent />
 * ```
 */
export const Redirect = markResponseComponent(
  function Redirect({ to, permanent }: RedirectProps): ReactElement {
    return React.createElement("response-redirect", { to, permanent });
  },
  "redirect"
);

/**
 * Send an empty response (for DELETE, etc.)
 */
export const Empty = markResponseComponent(
  function Empty(): ReactElement {
    return React.createElement("response-empty");
  },
  "empty"
);

// ============================================================================
// Utility Response Components
// ============================================================================

export interface ErrorResponseProps {
  message: string;
  code?: number;
  details?: Record<string, unknown>;
}

/**
 * Standard error response format.
 *
 * @example
 * ```tsx
 * <ErrorResponse message="Not found" code={404} />
 * ```
 */
export function ErrorResponse({
  message,
  code = 500,
  details
}: ErrorResponseProps): ReactElement {
  return (
    <Status code={code}>
      <Object>
        <Field name="error">{message}</Field>
        {code && <Field name="code">{code}</Field>}
        {details && <Field name="details"><Literal value={details} /></Field>}
      </Object>
    </Status>
  );
}

export interface NotFoundResponseProps {
  message?: string;
}

/**
 * 404 Not Found response.
 */
export function NotFoundResponse({
  message = "Not found"
}: NotFoundResponseProps = {}): ReactElement {
  return <ErrorResponse message={message} code={404} />;
}

export interface CreatedResponseProps {
  children?: ReactNode;
  location?: string;
}

/**
 * 201 Created response, optionally with Location header.
 */
export function CreatedResponse({
  children,
  location
}: CreatedResponseProps): ReactElement {
  if (location) {
    return (
      <Status code={201}>
        <Header name="Location" value={location}>
          {children}
        </Header>
      </Status>
    );
  }
  return <Status code={201}>{children}</Status>;
}

// ============================================================================
// Conditional Components
// ============================================================================

export interface WhenProps {
  condition: boolean;
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Conditional rendering for responses.
 *
 * @example
 * ```tsx
 * <When condition={user !== null} fallback={<NotFoundResponse />}>
 *   <UserObject user={user} />
 * </When>
 * ```
 */
export function When({ condition, children, fallback }: WhenProps): ReactElement | null {
  if (condition) {
    return <>{children}</>;
  }
  return fallback ? <>{fallback}</> : null;
}

export interface MatchProps<T> {
  value: T;
  children: ReactNode;
}

export interface CaseProps<T> {
  when: T | ((value: T) => boolean);
  children: ReactNode;
}

export interface DefaultProps {
  children: ReactNode;
}

/**
 * Pattern matching for responses.
 *
 * @example
 * ```tsx
 * <Match value={user.role}>
 *   <Case when="admin"><AdminView /></Case>
 *   <Case when="user"><UserView /></Case>
 *   <Default><GuestView /></Default>
 * </Match>
 * ```
 */
export function Match<T>({ value, children }: MatchProps<T>): ReactElement | null {
  const childArray = React.Children.toArray(children);

  for (const child of childArray) {
    if (!React.isValidElement(child)) continue;

    const props = child.props as CaseProps<T> | DefaultProps;

    if ("when" in props) {
      const { when } = props as CaseProps<T>;
      const matches = typeof when === "function"
        ? (when as (v: T) => boolean)(value)
        : when === value;

      if (matches) {
        return <>{props.children}</>;
      }
    }
  }

  // Look for Default
  for (const child of childArray) {
    if (!React.isValidElement(child)) continue;
    if (!("when" in child.props)) {
      return <>{child.props.children}</>;
    }
  }

  return null;
}

export function Case<T>({ children }: CaseProps<T>): ReactElement {
  return <>{children}</>;
}

export function Default({ children }: DefaultProps): ReactElement {
  return <>{children}</>;
}
