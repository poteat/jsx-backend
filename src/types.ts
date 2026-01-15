import type { Request, Response, NextFunction, RequestHandler } from "express";

// Re-export Express types for convenience
export type { Request, Response, NextFunction, RequestHandler };

/**
 * HTTP methods supported by the framework
 */
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete" | "options" | "head" | "all";

/**
 * A route handler function - similar to Express but with typed context
 */
export type RouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

/**
 * Middleware function type
 */
export type MiddlewareHandler = RequestHandler;

/**
 * Internal node types for the reconciler tree
 */
export type ServerNodeType =
  | "server"
  | "router"
  | "route"
  | "middleware"
  | "get"
  | "post"
  | "put"
  | "patch"
  | "delete"
  | "options"
  | "head"
  | "all"
  | "static"
  | "error-boundary";

/**
 * Base interface for all server tree nodes
 */
export interface ServerNode {
  type: ServerNodeType;
  props: Record<string, unknown>;
  children: ServerNode[];
  parent: ServerNode | null;
}

/**
 * Server component props
 */
export interface ServerProps {
  port?: number;
  host?: string;
  onListen?: (port: number, host: string) => void;
  children?: React.ReactNode;
}

/**
 * Router component props - creates a sub-router with a path prefix
 */
export interface RouterProps {
  path?: string;
  children?: React.ReactNode;
}

/**
 * Route component props - groups handlers under a path
 */
export interface RouteProps {
  path: string;
  children?: React.ReactNode;
}

/**
 * Base props for HTTP method components.
 * Can use either a handler function OR children (response components).
 */
export interface MethodProps {
  path?: string;
  /** Traditional Express-style handler function */
  handler?: RouteHandler;
  /** Response components - rendered to JSON on each request */
  children?: React.ReactNode;
}

/**
 * Middleware component props
 */
export interface MiddlewareProps {
  handler: MiddlewareHandler;
  children?: React.ReactNode;
}

/**
 * Static files component props
 */
export interface StaticProps {
  path: string;
  root: string;
  options?: {
    dotfiles?: "allow" | "deny" | "ignore";
    etag?: boolean;
    extensions?: string[];
    index?: boolean | string | string[];
    maxAge?: number | string;
    redirect?: boolean;
  };
}

/**
 * Error boundary props for handling errors in routes
 */
export interface ErrorBoundaryProps {
  fallback?: (error: Error, req: Request, res: Response) => void;
  children?: React.ReactNode;
}

/**
 * Context for the current request - can be accessed via hooks
 */
export interface RequestContext {
  req: Request;
  res: Response;
  params: Record<string, string>;
  query: Record<string, string | string[] | undefined>;
}

/**
 * Server instance returned from render
 */
export interface ServerInstance {
  /** The underlying Express app */
  app: import("express").Express;
  /** Start listening (if not already started via props) */
  listen: (port?: number, host?: string) => Promise<void>;
  /** Stop the server */
  close: () => Promise<void>;
  /** Update the server (re-render) */
  update: (element: React.ReactElement) => void;
}
