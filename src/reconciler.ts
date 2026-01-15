import React from "react";
import express, { Express, Router, Request, Response, NextFunction } from "express";
import type { ServerNode, ServerNodeType, HttpMethod } from "./types.js";

/**
 * Create a new server node for the tree
 */
function createNode(
  type: ServerNodeType,
  props: Record<string, unknown>,
  parent: ServerNode | null = null
): ServerNode {
  return {
    type,
    props,
    children: [],
    parent,
  };
}

/**
 * Check if a function component is one of our server components
 */
function getServerNodeType(element: React.ReactElement): ServerNodeType | null {
  const type = element.type;

  if (typeof type === "function") {
    // Check for our marker
    const nodeType = (type as any).__serverNodeType;
    if (nodeType) {
      return nodeType as ServerNodeType;
    }
  }

  return null;
}

/**
 * Recursively traverse the React element tree and build a server node tree
 */
function traverseElement(
  element: React.ReactNode,
  parent: ServerNode | null = null
): ServerNode[] {
  const nodes: ServerNode[] = [];

  // Handle arrays (fragments, mapped children)
  if (Array.isArray(element)) {
    for (const child of element) {
      nodes.push(...traverseElement(child, parent));
    }
    return nodes;
  }

  // Skip null/undefined/boolean
  if (element == null || typeof element === "boolean") {
    return nodes;
  }

  // Skip strings and numbers
  if (typeof element === "string" || typeof element === "number") {
    return nodes;
  }

  // Must be a React element
  if (!React.isValidElement(element)) {
    return nodes;
  }

  const nodeType = getServerNodeType(element);

  if (nodeType) {
    // This is one of our server components
    const props = { ...element.props };
    const children = props.children;
    delete props.children;

    const node = createNode(nodeType, props, parent);

    // Recursively process children
    if (children) {
      node.children = traverseElement(children, node);
    }

    nodes.push(node);
  } else {
    // This is a regular React component - render it and process the result
    const type = element.type;

    if (typeof type === "function") {
      // Function component - call it to get its children
      try {
        const rendered = (type as React.FC<any>)(element.props);
        nodes.push(...traverseElement(rendered, parent));
      } catch (e) {
        console.warn("Error rendering component:", e);
      }
    } else if (typeof type === "symbol" || (type as unknown) === React.Fragment) {
      // Fragment - just process children
      const children = element.props?.children;
      if (children) {
        nodes.push(...traverseElement(children, parent));
      }
    }
  }

  return nodes;
}

/**
 * HTTP methods that map to Express router methods
 */
const HTTP_METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete", "options", "head", "all"];

/**
 * Recursively process the server node tree and configure Express
 */
function processNode(
  node: ServerNode,
  router: Router,
  basePath: string = ""
): void {
  const { type, props, children } = node;

  switch (type) {
    case "server": {
      // Server is the root - just process children
      for (const child of children) {
        processNode(child, router, basePath);
      }
      break;
    }

    case "router": {
      // Create a sub-router with optional path prefix
      const subRouter = Router();
      const routerPath = (props.path as string) || "";

      for (const child of children) {
        processNode(child, subRouter, "");
      }

      if (basePath + routerPath) {
        router.use(basePath + routerPath, subRouter);
      } else {
        router.use(subRouter);
      }
      break;
    }

    case "route": {
      // Route groups handlers under a path
      const routePath = (props.path as string) || "/";

      for (const child of children) {
        processNode(child, router, basePath + routePath);
      }
      break;
    }

    case "middleware": {
      // Apply middleware at this level
      const handler = props.handler as express.RequestHandler;

      if (basePath) {
        router.use(basePath, handler);
      } else {
        router.use(handler);
      }

      // Process children (middleware can wrap routes)
      for (const child of children) {
        processNode(child, router, basePath);
      }
      break;
    }

    case "static": {
      // Serve static files
      const staticPath = (props.path as string) || "/";
      const root = props.root as string;
      const options = props.options as Parameters<typeof express.static>[1];

      router.use(basePath + staticPath, express.static(root, options));
      break;
    }

    case "error-boundary": {
      // Error boundaries wrap their children with error handling
      const fallback = props.fallback as ((error: Error, req: Request, res: Response) => void) | undefined;

      // Create a sub-router for the error boundary scope
      const subRouter = Router();

      for (const child of children) {
        processNode(child, subRouter, "");
      }

      // Add the sub-router
      router.use(basePath || "/", subRouter);

      // Add error handler for this scope
      if (fallback) {
        const errorHandler: express.ErrorRequestHandler = (err, req, res, _next) => {
          fallback(err, req, res);
        };
        router.use(basePath || "/", errorHandler);
      }
      break;
    }

    // HTTP methods
    case "get":
    case "post":
    case "put":
    case "patch":
    case "delete":
    case "options":
    case "head":
    case "all": {
      const methodPath = (props.path as string) || "";
      const handler = props.handler as express.RequestHandler;
      const fullPath = basePath + methodPath || "/";

      router[type](fullPath, handler);
      break;
    }
  }
}

/**
 * Build an Express app from the server node tree
 */
function buildExpressApp(rootNodes: ServerNode[]): Express {
  const app = express();

  // Add default middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Process the tree
  const rootRouter = Router();

  for (const node of rootNodes) {
    processNode(node, rootRouter);
  }

  app.use(rootRouter);

  return app;
}

export interface RenderResult {
  app: Express;
  nodes: ServerNode[];
  update: (element: React.ReactElement) => Express;
}

/**
 * Render a JSX element tree into an Express app
 *
 * @example
 * ```tsx
 * const { app } = render(
 *   <Server>
 *     <Get path="/" handler={(req, res) => res.send("Hello!")} />
 *   </Server>
 * );
 *
 * app.listen(3000);
 * ```
 */
export function render(element: React.ReactElement): RenderResult {
  // Traverse the React element tree to build our server node tree
  let nodes = traverseElement(element);

  // Build the Express app
  let app = buildExpressApp(nodes);

  return {
    app,
    nodes,
    update: (newElement: React.ReactElement) => {
      // Re-traverse and rebuild
      nodes = traverseElement(newElement);
      app = buildExpressApp(nodes);
      return app;
    },
  };
}

/**
 * Debug utility to print the server node tree
 */
export function printTree(nodes: ServerNode[], indent: string = ""): void {
  for (const node of nodes) {
    const path = node.props.path || "";
    console.log(`${indent}${node.type}${path ? ` (${path})` : ""}`);
    if (node.children.length > 0) {
      printTree(node.children, indent + "  ");
    }
  }
}
