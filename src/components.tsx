import React from "react";
import type {
  ServerProps,
  RouterProps,
  RouteProps,
  MethodProps,
  MiddlewareProps,
  StaticProps,
  ErrorBoundaryProps,
  RouteHandler,
  Request,
  Response,
  NextFunction,
  ServerNodeType,
} from "./types.js";

/**
 * Symbol to mark our custom elements for the reconciler
 */
export const SERVER_ELEMENT_TYPE = Symbol.for("jsx-backend.element");

/**
 * Create a server element that the reconciler understands
 */
function createElement(
  type: ServerNodeType,
  props: Record<string, unknown>,
  children?: React.ReactNode
): React.ReactElement {
  // We use React.createElement with a special component that stores our metadata
  const ServerElement = ({ children: _children }: { children?: React.ReactNode }) => {
    return null; // Actual rendering is handled by reconciler
  };

  // Mark it with our type for the reconciler to pick up
  (ServerElement as any).__serverNodeType = type;
  (ServerElement as any).__serverProps = props;

  return React.createElement(ServerElement, { ...props, children });
}

// ============================================================================
// Core Components
// ============================================================================

/**
 * The root Server component.
 * Wraps all routes and configuration for your HTTP server.
 *
 * @example
 * ```tsx
 * <Server port={3000} onListen={(port) => console.log(`Listening on ${port}`)}>
 *   <Get path="/" handler={(req, res) => res.send("Hello!")} />
 * </Server>
 * ```
 */
export function Server({ children, port, host, onListen }: ServerProps): React.ReactElement {
  return createElement("server", { port, host, onListen }, children);
}
Server.__serverNodeType = "server" as const;

/**
 * Creates a sub-router with an optional path prefix.
 * Useful for organizing related routes.
 *
 * @example
 * ```tsx
 * <Router path="/api">
 *   <Get path="/users" handler={getUsers} />
 *   <Post path="/users" handler={createUser} />
 * </Router>
 * ```
 */
export function Router({ path, children }: RouterProps): React.ReactElement {
  return createElement("router", { path }, children);
}
Router.__serverNodeType = "router" as const;

/**
 * Groups handlers under a specific path.
 * Children inherit this path as their base.
 *
 * @example
 * ```tsx
 * <Route path="/users/:id">
 *   <Get handler={getUser} />
 *   <Put handler={updateUser} />
 *   <Delete handler={deleteUser} />
 * </Route>
 * ```
 */
export function Route({ path, children }: RouteProps): React.ReactElement {
  return createElement("route", { path }, children);
}
Route.__serverNodeType = "route" as const;

/**
 * Apply middleware to all nested routes.
 * Middleware executes in order before route handlers.
 *
 * @example
 * ```tsx
 * <Middleware handler={authMiddleware}>
 *   <Route path="/protected">
 *     <Get handler={protectedResource} />
 *   </Route>
 * </Middleware>
 * ```
 */
export function Middleware({ handler, children }: MiddlewareProps): React.ReactElement {
  return createElement("middleware", { handler }, children);
}
Middleware.__serverNodeType = "middleware" as const;

/**
 * Serve static files from a directory.
 *
 * @example
 * ```tsx
 * <Static path="/assets" root="./public" />
 * ```
 */
export function Static({ path, root, options }: StaticProps): React.ReactElement {
  return createElement("static", { path, root, options });
}
Static.__serverNodeType = "static" as const;

/**
 * Wrap routes with error handling.
 * If any nested handler throws, the fallback is called.
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallback={(err, req, res) => res.status(500).json({ error: err.message })}>
 *   <Get path="/risky" handler={riskyOperation} />
 * </ErrorBoundary>
 * ```
 */
export function ErrorBoundary({ fallback, children }: ErrorBoundaryProps): React.ReactElement {
  return createElement("error-boundary", { fallback }, children);
}
ErrorBoundary.__serverNodeType = "error-boundary" as const;

// ============================================================================
// HTTP Method Components
// ============================================================================

/**
 * Handle GET requests.
 *
 * @example
 * ```tsx
 * <Get path="/users" handler={(req, res) => res.json(users)} />
 * ```
 */
export function Get({ path, handler }: MethodProps): React.ReactElement {
  return createElement("get", { path, handler });
}
Get.__serverNodeType = "get" as const;

/**
 * Handle POST requests.
 *
 * @example
 * ```tsx
 * <Post path="/users" handler={(req, res) => {
 *   const user = createUser(req.body);
 *   res.status(201).json(user);
 * }} />
 * ```
 */
export function Post({ path, handler }: MethodProps): React.ReactElement {
  return createElement("post", { path, handler });
}
Post.__serverNodeType = "post" as const;

/**
 * Handle PUT requests.
 */
export function Put({ path, handler }: MethodProps): React.ReactElement {
  return createElement("put", { path, handler });
}
Put.__serverNodeType = "put" as const;

/**
 * Handle PATCH requests.
 */
export function Patch({ path, handler }: MethodProps): React.ReactElement {
  return createElement("patch", { path, handler });
}
Patch.__serverNodeType = "patch" as const;

/**
 * Handle DELETE requests.
 */
export function Delete({ path, handler }: MethodProps): React.ReactElement {
  return createElement("delete", { path, handler });
}
Delete.__serverNodeType = "delete" as const;

/**
 * Handle OPTIONS requests.
 */
export function Options({ path, handler }: MethodProps): React.ReactElement {
  return createElement("options", { path, handler });
}
Options.__serverNodeType = "options" as const;

/**
 * Handle HEAD requests.
 */
export function Head({ path, handler }: MethodProps): React.ReactElement {
  return createElement("head", { path, handler });
}
Head.__serverNodeType = "head" as const;

/**
 * Handle all HTTP methods.
 */
export function All({ path, handler }: MethodProps): React.ReactElement {
  return createElement("all", { path, handler });
}
All.__serverNodeType = "all" as const;

// ============================================================================
// Higher-Level Abstractions
// ============================================================================

/**
 * Props for the Resource component - a RESTful resource with standard CRUD operations
 */
export interface ResourceProps {
  path: string;
  list?: RouteHandler;
  get?: RouteHandler;
  create?: RouteHandler;
  update?: RouteHandler;
  remove?: RouteHandler;
  children?: React.ReactNode;
}

/**
 * A RESTful resource component that sets up standard CRUD routes.
 * Automatically creates GET (list), GET/:id, POST, PUT/:id, DELETE/:id routes.
 *
 * @example
 * ```tsx
 * <Resource
 *   path="/users"
 *   list={listUsers}
 *   get={getUser}
 *   create={createUser}
 *   update={updateUser}
 *   remove={deleteUser}
 * />
 * ```
 */
export function Resource({
  path,
  list,
  get: getOne,
  create,
  update,
  remove,
  children,
}: ResourceProps): React.ReactElement {
  return (
    <Route path={path}>
      {list && <Get handler={list} />}
      {create && <Post handler={create} />}
      <Route path="/:id">
        {getOne && <Get handler={getOne} />}
        {update && <Put handler={update} />}
        {remove && <Delete handler={remove} />}
      </Route>
      {children}
    </Route>
  );
}

/**
 * Props for the Api component - wraps routes with common API middleware
 */
export interface ApiProps {
  path?: string;
  cors?: boolean | CorsOptions;
  children?: React.ReactNode;
}

export interface CorsOptions {
  origin?: string | string[] | boolean;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
}

/**
 * Simple CORS middleware factory
 */
function createCorsMiddleware(options: CorsOptions | boolean) {
  const opts: CorsOptions = typeof options === "boolean" ? {} : options;

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = opts.origin ?? "*";
    const methods = opts.methods ?? ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];
    const headers = opts.allowedHeaders ?? ["Content-Type", "Authorization"];

    if (typeof origin === "string") {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else if (Array.isArray(origin)) {
      const requestOrigin = req.headers.origin;
      if (requestOrigin && origin.includes(requestOrigin)) {
        res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      }
    } else if (origin === true) {
      res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    }

    res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
    res.setHeader("Access-Control-Allow-Headers", headers.join(", "));

    if (opts.credentials) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}

/**
 * An API wrapper component that adds common middleware like CORS.
 *
 * @example
 * ```tsx
 * <Api path="/api/v1" cors>
 *   <Resource path="/users" ... />
 *   <Resource path="/posts" ... />
 * </Api>
 * ```
 */
export function Api({ path = "/api", cors, children }: ApiProps): React.ReactElement {
  if (cors) {
    return (
      <Router path={path}>
        <Middleware handler={createCorsMiddleware(cors)}>
          {children}
        </Middleware>
      </Router>
    );
  }

  return <Router path={path}>{children}</Router>;
}

// ============================================================================
// Utility Components
// ============================================================================

/**
 * Health check endpoint component
 */
export interface HealthCheckProps {
  path?: string;
  checks?: Record<string, () => Promise<boolean> | boolean>;
}

/**
 * A health check endpoint that reports server status.
 *
 * @example
 * ```tsx
 * <HealthCheck path="/health" checks={{
 *   database: async () => await db.ping(),
 *   cache: () => cache.isConnected,
 * }} />
 * ```
 */
export function HealthCheck({ path = "/health", checks = {} }: HealthCheckProps): React.ReactElement {
  const handler: RouteHandler = async (req, res) => {
    const results: Record<string, boolean> = {};
    let healthy = true;

    for (const [name, check] of Object.entries(checks)) {
      try {
        results[name] = await check();
        if (!results[name]) healthy = false;
      } catch {
        results[name] = false;
        healthy = false;
      }
    }

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "healthy" : "unhealthy",
      checks: results,
      timestamp: new Date().toISOString(),
    });
  };

  return <Get path={path} handler={handler} />;
}

/**
 * A catch-all 404 handler
 */
export interface NotFoundProps {
  message?: string;
}

export function NotFound({ message = "Not Found" }: NotFoundProps): React.ReactElement {
  return (
    <All
      path="*"
      handler={(req, res) => {
        res.status(404).json({ error: message, path: req.path });
      }}
    />
  );
}
