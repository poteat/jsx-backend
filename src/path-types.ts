/**
 * Type utilities for extracting route parameters from path strings.
 *
 * These allow compile-time type inference of route params:
 *
 * @example
 * ```typescript
 * type Params = ExtractRouteParams<"/users/:userId/posts/:postId">;
 * // Result: { userId: string; postId: string }
 * ```
 */

/**
 * Extract a single parameter name from a path segment.
 * Handles both "/:param" and "/:param/" patterns.
 */
type ExtractParam<Segment extends string> =
  Segment extends `:${infer Param}` ? Param : never;

/**
 * Recursively extract all route parameters from a path string.
 *
 * @example
 * ```typescript
 * type P1 = ExtractRouteParams<"/users/:id">;
 * // { id: string }
 *
 * type P2 = ExtractRouteParams<"/users/:userId/posts/:postId">;
 * // { userId: string; postId: string }
 *
 * type P3 = ExtractRouteParams<"/static/path">;
 * // {}
 * ```
 */
export type ExtractRouteParams<Path extends string> =
  Path extends `${string}/:${infer Param}/${infer Rest}`
    ? { [K in Param]: string } & ExtractRouteParams<`/${Rest}`>
    : Path extends `${string}/:${infer Param}`
      ? { [K in Param]: string }
      : {};

/**
 * Merge multiple param objects into one.
 * Used when combining params from nested routes.
 */
export type MergeParams<T, U> = T & U;

/**
 * Context passed to render props in typed routes.
 */
export interface TypedRouteContext<Params extends Record<string, string>> {
  params: Params;
  query: Record<string, string | string[] | undefined>;
  body: unknown;
}

/**
 * A render function that receives typed route context.
 */
export type TypedRenderFn<Params extends Record<string, string>> = (
  context: TypedRouteContext<Params>
) => React.ReactNode;

/**
 * Props for typed route method components (Get, Post, etc.)
 * Supports both children and render prop patterns.
 */
export interface TypedMethodProps<
  Path extends string = string,
  Params extends Record<string, string> = ExtractRouteParams<Path>
> {
  path?: Path;
  /** Traditional Express-style handler function */
  handler?: import("./types.js").RouteHandler;
  /** Response components (untyped) */
  children?: React.ReactNode;
  /** Typed render prop - receives params with correct types */
  render?: TypedRenderFn<Params>;
}

/**
 * Helper type to get params from a path, falling back to generic Record.
 */
export type ParamsFromPath<Path extends string> =
  ExtractRouteParams<Path> extends infer P
    ? keyof P extends never
      ? Record<string, string>
      : P
    : Record<string, string>;

/**
 * Type-safe useParams that can infer from a path string.
 *
 * @example
 * ```typescript
 * // Explicit params type
 * const { id } = useTypedParams<"/users/:id">();
 *
 * // Or with explicit object type
 * const { userId, postId } = useTypedParams<{ userId: string; postId: string }>();
 * ```
 */
export type UseTypedParams = {
  // Overload 1: Path string literal
  <Path extends string>(): ExtractRouteParams<Path>;
  // Overload 2: Explicit params object
  <Params extends Record<string, string>>(): Params;
};

// ============================================================================
// Utility types for building type-safe route trees
// ============================================================================

/**
 * Represents accumulated params from parent routes.
 * Used internally to track params through nested routes.
 */
export type AccumulatedParams<
  ParentParams extends Record<string, string>,
  CurrentPath extends string
> = ParentParams & ExtractRouteParams<CurrentPath>;

/**
 * Type helper for nested routes.
 * Combines parent params with current route params.
 */
export type NestedRouteParams<
  ParentParams extends Record<string, string>,
  ChildPath extends string
> = MergeParams<ParentParams, ExtractRouteParams<ChildPath>>;
