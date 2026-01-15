/**
 * Route helper functions for better type inference.
 *
 * These helpers let you write typed routes without explicit type parameters:
 *
 * @example
 * ```tsx
 * // Instead of:
 * <Get<"/users/:id"> path="/users/:id" render={...} />
 *
 * // You can write:
 * <Route path={path("/users/:id")} render={...} />
 *
 * // Or use builder functions:
 * {get("/users/:id", ({ params }) => <UserResponse id={params.id} />)}
 * ```
 */

import React from "react";
import type { ExtractRouteParams, TypedRouteContext } from "./path-types.js";
import type { RouteHandler } from "./types.js";
import { Get, Post, Put, Patch, Delete, Options, Head, All } from "./components.js";

// ============================================================================
// Path Helper - Preserves literal type for render props
// ============================================================================

/**
 * A typed path wrapper that preserves the literal type.
 */
export interface TypedPath<P extends string> {
  readonly value: P;
  readonly _brand: "TypedPath";
}

/**
 * Create a typed path that preserves the literal type for render props.
 *
 * @example
 * ```tsx
 * const userPath = path("/users/:id");
 *
 * // Works in Get/Post/etc with render props
 * <Get path={userPath.value} render={({ params }) => {
 *   // params is typed as { id: string }
 * }} />
 * ```
 */
export function path<P extends string>(p: P): TypedPath<P> {
  return { value: p, _brand: "TypedPath" };
}

// ============================================================================
// Function-based Route Builders - Best type inference
// ============================================================================

/**
 * Render function type - receives typed context based on path
 */
type RenderFn<Path extends string> = (
  context: TypedRouteContext<ExtractRouteParams<Path>>
) => React.ReactNode;

/**
 * Options for function-based route builders
 */
interface RouteBuilderOptions {
  /** Response component children (untyped) */
  children?: React.ReactNode;
  /** Traditional Express handler */
  handler?: RouteHandler;
}

/**
 * Create a typed GET route with inferred params.
 *
 * @example
 * ```tsx
 * // Type-safe render prop
 * {get("/users/:id", ({ params }) => (
 *   <UserResponse id={params.id} />  // params.id is typed!
 * ))}
 *
 * // With traditional handler
 * {get("/users", { handler: (req, res) => res.json(users) })}
 *
 * // With response children
 * {get("/health", { children: <HealthResponse /> })}
 * ```
 */
export function get<P extends string>(
  path: P,
  renderOrOptions: RenderFn<P> | RouteBuilderOptions
): React.ReactElement {
  if (typeof renderOrOptions === "function") {
    return React.createElement(Get, { path, render: renderOrOptions as any });
  }
  return React.createElement(Get, {
    path,
    handler: renderOrOptions.handler,
    children: renderOrOptions.children,
  });
}

/**
 * Create a typed POST route with inferred params.
 *
 * @example
 * ```tsx
 * {post("/users", ({ body }) => (
 *   <CreateUserResponse data={body} />
 * ))}
 * ```
 */
export function post<P extends string>(
  path: P,
  renderOrOptions: RenderFn<P> | RouteBuilderOptions
): React.ReactElement {
  if (typeof renderOrOptions === "function") {
    return React.createElement(Post, { path, render: renderOrOptions as any });
  }
  return React.createElement(Post, {
    path,
    handler: renderOrOptions.handler,
    children: renderOrOptions.children,
  });
}

/**
 * Create a typed PUT route with inferred params.
 */
export function put<P extends string>(
  path: P,
  renderOrOptions: RenderFn<P> | RouteBuilderOptions
): React.ReactElement {
  if (typeof renderOrOptions === "function") {
    return React.createElement(Put, { path, render: renderOrOptions as any });
  }
  return React.createElement(Put, {
    path,
    handler: renderOrOptions.handler,
    children: renderOrOptions.children,
  });
}

/**
 * Create a typed PATCH route with inferred params.
 */
export function patch<P extends string>(
  path: P,
  renderOrOptions: RenderFn<P> | RouteBuilderOptions
): React.ReactElement {
  if (typeof renderOrOptions === "function") {
    return React.createElement(Patch, { path, render: renderOrOptions as any });
  }
  return React.createElement(Patch, {
    path,
    handler: renderOrOptions.handler,
    children: renderOrOptions.children,
  });
}

/**
 * Create a typed DELETE route with inferred params.
 */
export function del<P extends string>(
  path: P,
  renderOrOptions: RenderFn<P> | RouteBuilderOptions
): React.ReactElement {
  if (typeof renderOrOptions === "function") {
    return React.createElement(Delete, { path, render: renderOrOptions as any });
  }
  return React.createElement(Delete, {
    path,
    handler: renderOrOptions.handler,
    children: renderOrOptions.children,
  });
}

/**
 * Create a typed OPTIONS route with inferred params.
 */
export function options<P extends string>(
  path: P,
  renderOrOptions: RenderFn<P> | RouteBuilderOptions
): React.ReactElement {
  if (typeof renderOrOptions === "function") {
    return React.createElement(Options, { path, render: renderOrOptions as any });
  }
  return React.createElement(Options, {
    path,
    handler: renderOrOptions.handler,
    children: renderOrOptions.children,
  });
}

/**
 * Create a typed HEAD route with inferred params.
 */
export function head<P extends string>(
  path: P,
  renderOrOptions: RenderFn<P> | RouteBuilderOptions
): React.ReactElement {
  if (typeof renderOrOptions === "function") {
    return React.createElement(Head, { path, render: renderOrOptions as any });
  }
  return React.createElement(Head, {
    path,
    handler: renderOrOptions.handler,
    children: renderOrOptions.children,
  });
}

/**
 * Create a typed ALL route with inferred params.
 */
export function all<P extends string>(
  path: P,
  renderOrOptions: RenderFn<P> | RouteBuilderOptions
): React.ReactElement {
  if (typeof renderOrOptions === "function") {
    return React.createElement(All, { path, render: renderOrOptions as any });
  }
  return React.createElement(All, {
    path,
    handler: renderOrOptions.handler,
    children: renderOrOptions.children,
  });
}

// ============================================================================
// Route Builder Chain Pattern
// ============================================================================

/**
 * A chainable route builder for more complex scenarios.
 *
 * @example
 * ```tsx
 * const userRoutes = route("/users/:id")
 *   .get(({ params }) => <GetUserResponse id={params.id} />)
 *   .put(({ params, body }) => <UpdateUserResponse id={params.id} data={body} />)
 *   .delete(({ params }) => <DeleteUserResponse id={params.id} />);
 *
 * // Use in JSX
 * <Server>
 *   {userRoutes.build()}
 * </Server>
 * ```
 */
export interface RouteBuilder<P extends string> {
  get(render: RenderFn<P>): RouteBuilder<P>;
  post(render: RenderFn<P>): RouteBuilder<P>;
  put(render: RenderFn<P>): RouteBuilder<P>;
  patch(render: RenderFn<P>): RouteBuilder<P>;
  delete(render: RenderFn<P>): RouteBuilder<P>;
  options(render: RenderFn<P>): RouteBuilder<P>;
  head(render: RenderFn<P>): RouteBuilder<P>;
  all(render: RenderFn<P>): RouteBuilder<P>;
  build(): React.ReactElement[];
}

/**
 * Create a route builder for a path.
 *
 * @example
 * ```tsx
 * const api = route("/api/users/:id")
 *   .get(({ params }) => <UserResponse id={params.id} />)
 *   .put(({ params, body }) => <UpdateResponse id={params.id} data={body} />);
 *
 * <Server>{api.build()}</Server>
 * ```
 */
export function route<P extends string>(path: P): RouteBuilder<P> {
  const routes: React.ReactElement[] = [];

  const builder: RouteBuilder<P> = {
    get(render) {
      routes.push(get(path, render));
      return builder;
    },
    post(render) {
      routes.push(post(path, render));
      return builder;
    },
    put(render) {
      routes.push(put(path, render));
      return builder;
    },
    patch(render) {
      routes.push(patch(path, render));
      return builder;
    },
    delete(render) {
      routes.push(del(path, render));
      return builder;
    },
    options(render) {
      routes.push(options(path, render));
      return builder;
    },
    head(render) {
      routes.push(head(path, render));
      return builder;
    },
    all(render) {
      routes.push(all(path, render));
      return builder;
    },
    build() {
      return routes;
    },
  };

  return builder;
}
