import React, { ReactElement, ReactNode } from "react";
import type { Request, Response } from "express";
import { setRequestContext, RequestContextValue } from "./response.js";

/**
 * Result of rendering a response component tree
 */
export interface RenderResult {
  body: unknown;
  status: number;
  headers: Record<string, string>;
  redirect?: { to: string; permanent: boolean };
  empty: boolean;
}

/**
 * Get the response type from an element (either from type marker or element type string)
 */
function getResponseType(element: ReactElement): string | null {
  const type = element.type;

  // Check for our marker on function components
  if (typeof type === "function") {
    return (type as any).__responseType ?? null;
  }

  // Check for our special element type strings
  if (typeof type === "string" && type.startsWith("response-")) {
    return type.replace("response-", "");
  }

  return null;
}

/**
 * Flatten children by rendering function components and expanding fragments.
 * This ensures wrapper components like When/Match properly expose their children.
 */
function flattenChildren(children: ReactNode): ReactNode[] {
  const result: ReactNode[] = [];

  const childArray = React.Children.toArray(children);

  for (const child of childArray) {
    if (!React.isValidElement(child)) {
      result.push(child);
      continue;
    }

    const type = child.type;

    // If it's a response component (has marker), keep it as-is
    if (typeof type === "function" && (type as any).__responseType) {
      result.push(child);
      continue;
    }

    // If it's a function component, render it and flatten the result
    if (typeof type === "function") {
      try {
        const rendered = (type as React.FC<any>)(child.props);
        result.push(...flattenChildren(rendered));
      } catch (e) {
        // If rendering fails, keep the original
        result.push(child);
      }
      continue;
    }

    // If it's a Fragment, flatten its children
    if ((type as unknown) === React.Fragment || typeof type === "symbol") {
      result.push(...flattenChildren(child.props.children));
      continue;
    }

    // Otherwise keep as-is
    result.push(child);
  }

  return result;
}

/**
 * Recursively render a React element tree to JSON
 */
function renderToJson(
  element: ReactNode,
  result: RenderResult
): unknown {
  // Handle null/undefined
  if (element == null) {
    return null;
  }

  // Primitives become literal values (including booleans)
  if (typeof element === "string" || typeof element === "number" || typeof element === "boolean") {
    return element;
  }

  // Handle arrays
  if (globalThis.Array.isArray(element)) {
    const items: unknown[] = [];
    for (const child of element) {
      const rendered = renderToJson(child, result);
      if (rendered !== undefined) {
        items.push(rendered);
      }
    }
    return items.length > 0 ? items : undefined;
  }

  // Must be a React element
  if (!React.isValidElement(element)) {
    return undefined;
  }

  const responseType = getResponseType(element);
  const props = element.props as Record<string, unknown>;

  // Handle our response components
  if (responseType) {
    switch (responseType) {
      case "object": {
        const obj: Record<string, unknown> = {};
        // Flatten children to handle wrapper components like When/Match
        const children = flattenChildren(props.children as ReactNode);

        for (const child of children) {
          if (!React.isValidElement(child)) continue;

          const childType = getResponseType(child);
          if (childType === "field") {
            const fieldProps = child.props as { name: string; children?: ReactNode };
            const value = renderToJson(fieldProps.children, result);
            if (value !== undefined) {
              obj[fieldProps.name] = value;
            }
          } else {
            // Non-field children in object - render and merge if object
            const rendered = renderToJson(child, result);
            if (rendered && typeof rendered === "object" && !globalThis.Array.isArray(rendered)) {
              globalThis.Object.assign(obj, rendered);
            }
          }
        }

        return obj;
      }

      case "array": {
        const items: unknown[] = [];
        // Flatten children to handle wrapper components like When/Match
        const children = flattenChildren(props.children as ReactNode);

        for (const child of children) {
          const rendered = renderToJson(child, result);
          if (rendered !== undefined) {
            items.push(rendered);
          }
        }

        return items;
      }

      case "field": {
        // Field outside of Object - just render the value
        return renderToJson(props.children as ReactNode, result);
      }

      case "literal": {
        return props.value;
      }

      case "status": {
        result.status = props.code as number;
        return renderToJson(props.children as ReactNode, result);
      }

      case "header": {
        result.headers[props.name as string] = props.value as string;
        return renderToJson(props.children as ReactNode, result);
      }

      case "redirect": {
        result.redirect = {
          to: props.to as string,
          permanent: (props.permanent as boolean) ?? false,
        };
        return undefined;
      }

      case "empty": {
        result.empty = true;
        return undefined;
      }
    }
  }

  // Regular React component - render it
  const type = element.type;

  if (typeof type === "function") {
    try {
      const rendered = (type as React.FC<any>)(props);
      return renderToJson(rendered, result);
    } catch (e) {
      console.error("Error rendering response component:", e);
      throw e;
    }
  }

  // Fragment or other symbol type
  if (typeof type === "symbol" || (type as unknown) === React.Fragment) {
    return renderToJson(props.children as ReactNode, result);
  }

  // Unknown element type - try to render children
  if (props.children) {
    return renderToJson(props.children as ReactNode, result);
  }

  return undefined;
}

/**
 * Render a response component tree in the context of a request
 */
export function renderResponse(
  element: ReactElement,
  req: Request,
  res: Response
): RenderResult {
  const context: RequestContextValue = {
    req,
    res,
    params: req.params as Record<string, string>,
    query: req.query as Record<string, string | string[] | undefined>,
    body: req.body,
  };

  const result: RenderResult = {
    body: null,
    status: 200,
    headers: {},
    empty: false,
  };

  // Set the synchronous context before rendering
  setRequestContext(context);

  try {
    result.body = renderToJson(element, result);
  } finally {
    // Clear context after rendering
    setRequestContext(null);
  }

  return result;
}

/**
 * Send the render result as an HTTP response
 */
export function sendResponse(result: RenderResult, res: Response): void {
  // Set headers
  for (const [name, value] of globalThis.Object.entries(result.headers)) {
    res.setHeader(name, value);
  }

  // Handle redirect
  if (result.redirect) {
    const code = result.redirect.permanent ? 301 : 302;
    res.redirect(code, result.redirect.to);
    return;
  }

  // Handle empty response
  if (result.empty) {
    res.status(result.status || 204).end();
    return;
  }

  // Send JSON response
  res.status(result.status).json(result.body);
}

/**
 * Create an Express handler from a response component
 */
export function createHandler(
  element: ReactElement
): (req: Request, res: Response) => void {
  return (req: Request, res: Response) => {
    try {
      const result = renderResponse(element, req, res);
      sendResponse(result, res);
    } catch (error) {
      console.error("Error rendering response:", error);
      res.status(500).json({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}
