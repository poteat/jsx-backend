/**
 * JSX Backend - Express-like HTTP server using React/JSX semantics
 *
 * This library lets you define HTTP APIs using React component patterns.
 * JSX trees are "rendered" into Express apps, and response bodies can
 * also be defined as component trees that render to JSON.
 *
 * @example
 * ```tsx
 * import { render, Server, Get, Object, Field, useParams } from "jsx-backend";
 *
 * function UserResponse() {
 *   const { id } = useParams();
 *   const user = getUser(id);
 *
 *   return (
 *     <Object>
 *       <Field name="id">{user.id}</Field>
 *       <Field name="name">{user.name}</Field>
 *     </Object>
 *   );
 * }
 *
 * const App = () => (
 *   <Server>
 *     <Get path="/users/:id">
 *       <UserResponse />
 *     </Get>
 *   </Server>
 * );
 *
 * const { app } = render(<App />);
 * app.listen(3000);
 * ```
 */

// Core render function
export { render, printTree } from "./reconciler.js";

// Response rendering (for advanced use cases)
export { renderResponse, sendResponse, createHandler } from "./render-response.js";

// Route Components
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

// Response Components
export {
  // JSON structure
  Object,
  Array,
  Field,
  Literal,
  // HTTP response modifiers
  Status,
  Header,
  Redirect,
  Empty,
  // Utility responses
  ErrorResponse,
  NotFoundResponse,
  CreatedResponse,
  // Conditional rendering
  When,
  Match,
  Case,
  Default,
} from "./response.js";

// Request context hooks
export {
  useRequest,
  useParams,
  useParamsFromPath,
  useQuery,
  useBody,
  useHeaders,
  useHeader,
  setRequestContext,
} from "./response.js";

// Path type utilities
export type {
  ExtractRouteParams,
  TypedRouteContext,
  TypedRenderFn,
  ParamsFromPath,
} from "./path-types.js";

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
export type {
  ObjectProps,
  ArrayProps,
  FieldProps,
  LiteralProps,
  StatusProps,
  HeaderProps,
  RedirectProps,
  ErrorResponseProps,
  NotFoundResponseProps,
  CreatedResponseProps,
  WhenProps,
  MatchProps,
  CaseProps,
  DefaultProps,
  RequestContextValue,
} from "./response.js";

// Route helpers for better type inference
export {
  // Path helper
  path,
  // Function-based route builders
  get,
  post,
  put,
  patch,
  del,
  options,
  head,
  all,
  // Route builder chain
  route,
} from "./route-helpers.js";

export type { TypedPath, RouteBuilder } from "./route-helpers.js";
