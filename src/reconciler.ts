import React from "react";
import express, { Express, Router, Request, Response, NextFunction } from "express";
import type { ServerNode, ServerNodeType, HttpMethod } from "./types.js";
import { renderResponse, sendResponse } from "./render-response.js";

/**
 * HTTP method node types
 */
const HTTP_METHOD_TYPES = new Set<ServerNodeType>([
  "get", "post", "put", "patch", "delete", "options", "head", "all"
]);

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
 * Check if a React element is a response component (not a server/route component)
 */
function isResponseElement(element: React.ReactNode): boolean {
  if (!React.isValidElement(element)) {
    return false;
  }

  // If it has a __serverNodeType, it's a server component, not a response
  const nodeType = getServerNodeType(element);
  if (nodeType) {
    return false;
  }

  // Otherwise it's a response component (or regular React component for responses)
  return true;
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

    // For HTTP method nodes, check if children are response elements
    if (HTTP_METHOD_TYPES.has(nodeType) && children) {
      // Check if any children are response elements (not server nodes)
      const childArray = React.Children.toArray(children);
      const hasResponseChildren = childArray.some(isResponseElement);

      if (hasResponseChildren && !props.handler) {
        // Store the original React element for response rendering
        // We wrap it in a fragment to preserve the tree structure
        node.props.responseElement = React.createElement(React.Fragment, null, children);
      } else {
        // Normal server node children - traverse them
        node.children = traverseElement(children, node);
      }
    } else if (children) {
      // Recursively process children for other node types
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
      const fullPath = basePath + methodPath || "/";

      // Check if we have a render prop (typed render function)
      const renderFn = props.render as ((ctx: any) => React.ReactNode) | undefined;

      // Check if we have a response element (component-based response)
      const responseElement = props.responseElement as React.ReactElement | undefined;

      if (renderFn) {
        // Typed render prop - call it with context at request time
        const handler: express.RequestHandler = (req, res) => {
          try {
            const context = {
              params: req.params as Record<string, string>,
              query: req.query as Record<string, string | string[] | undefined>,
              body: req.body,
              req,
              res,
            };
            // Call render function to get the response element
            const element = renderFn(context);
            if (React.isValidElement(element)) {
              const result = renderResponse(element, req, res);
              sendResponse(result, res);
            } else if (element != null) {
              // If it returns a primitive, send it directly
              res.json(element);
            } else {
              res.status(204).end();
            }
          } catch (error) {
            console.error("Error rendering response:", error);
            res.status(500).json({
              error: "Internal server error",
              message: error instanceof Error ? error.message : "Unknown error",
            });
          }
        };
        router[type](fullPath, handler);
      } else if (responseElement) {
        // Create a handler that renders the response component
        const handler: express.RequestHandler = (req, res) => {
          try {
            const result = renderResponse(responseElement, req, res);
            sendResponse(result, res);
          } catch (error) {
            console.error("Error rendering response:", error);
            res.status(500).json({
              error: "Internal server error",
              message: error instanceof Error ? error.message : "Unknown error",
            });
          }
        };
        router[type](fullPath, handler);
      } else {
        // Traditional handler function
        const handler = props.handler as express.RequestHandler;
        if (handler) {
          router[type](fullPath, handler);
        }
      }
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
 * // Traditional handler style
 * const { app } = render(
 *   <Server>
 *     <Get path="/" handler={(req, res) => res.send("Hello!")} />
 *   </Server>
 * );
 *
 * // Component-based response style
 * const { app } = render(
 *   <Server>
 *     <Get path="/">
 *       <Object>
 *         <Field name="message">Hello!</Field>
 *       </Object>
 *     </Get>
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
    const hasResponse = node.props.responseElement ? " [response]" : "";
    console.log(`${indent}${node.type}${path ? ` (${path})` : ""}${hasResponse}`);
    if (node.children.length > 0) {
      printTree(node.children, indent + "  ");
    }
  }
}
