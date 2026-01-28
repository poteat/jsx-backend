/**
 * express-jsx-core - Express your backend in JSX
 */

// Core types
export type {
  ExpressJsxElement,
  ExpressJsxNode,
  FieldProps,
  FieldElement,
  MergeFields,
  RouteProps,
  RouterProps,
  MiddlewareProps,
  MiddlewareFn,
  MiddlewareElement,
  AppProps,
  HttpMethod,
  RequestElement,
  ResponseElement,
  HandlerElement,
  MethodElement,
  MethodElementProps,
  GetElement,
  PostElement,
  PutElement,
  PatchElement,
  DeleteElement,
  OkElement,
  ErrElement,
  InputHandler,
  NoInputHandler,
  RouteHandler,
} from "./types.js";

// JSX factory and component markers
export {
  jsx,
  jsxs,
  Fragment,
  Field,
  Request,
  Response,
  Handler,
  Middleware,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Ok,
  Err,
  isExpressJsxElement,
  isFieldElement,
  isRequestElement,
  isResponseElement,
} from "./jsx-runtime.js";

// Components
export { App } from "./components/App.js";
export { Router } from "./components/Router.js";
export { Route } from "./components/Route.js";

// Hooks
export {
  useRequest,
  useParams,
  useQuery,
  useBody,
  useBodySafe,
  useHeader,
} from "./hooks/request.js";

// Context
export { createContext, useContext } from "./context.js";

// Render
export { render } from "./render.js";
