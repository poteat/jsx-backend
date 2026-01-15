/**
 * JSX Backend - Express-like HTTP server using React/JSX semantics
 *
 * This library lets you define HTTP APIs using React component patterns.
 * JSX trees are "rendered" into Express apps.
 *
 * @example
 * ```tsx
 * import { render, Server, Get, Post, Route, Middleware } from "jsx-backend";
 *
 * const App = () => (
 *   <Server>
 *     <Get path="/" handler={(req, res) => res.send("Hello, World!")} />
 *     <Route path="/api">
 *       <Get path="/users" handler={listUsers} />
 *       <Post path="/users" handler={createUser} />
 *     </Route>
 *   </Server>
 * );
 *
 * const { app } = render(<App />);
 * app.listen(3000);
 * ```
 */

// Core render function
export { render, printTree } from "./reconciler.js";

// Components
export {
  // Core
  Server,
  Router,
  Route,
  Middleware,
  Static,
  ErrorBoundary,
  // HTTP Methods
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Options,
  Head,
  All,
  // Higher-level abstractions
  Resource,
  Api,
  HealthCheck,
  NotFound,
} from "./components.js";

// Types
export type {
  ServerProps,
  RouterProps,
  RouteProps,
  MethodProps,
  MiddlewareProps,
  StaticProps,
  ErrorBoundaryProps,
  HttpMethod,
  RouteHandler,
  MiddlewareHandler,
  Request,
  Response,
  NextFunction,
  RequestHandler,
  RequestContext,
  ServerInstance,
  ServerNode,
  ServerNodeType,
} from "./types.js";

// Re-export component prop types
export type { ResourceProps, ApiProps, CorsOptions, HealthCheckProps, NotFoundProps } from "./components.js";
