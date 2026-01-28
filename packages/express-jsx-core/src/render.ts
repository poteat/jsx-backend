/**
 * Render engine for express-jsx-core
 *
 * Takes a express-jsx-core element tree (the App) and starts an HTTP server.
 */

import type { ExpressJsxElement, AppProps } from "./types.js";
import { isExpressJsxElement } from "./jsx-runtime.js";
import { App } from "./components/App.js";

/**
 * Render a express-jsx-core application
 *
 * This function takes the root App element and starts the server.
 */
export function render(element: ExpressJsxElement<AppProps>): void {
  if (!isExpressJsxElement(element)) {
    throw new Error("render() requires a express-jsx-core element");
  }

  if (element.type !== App) {
    throw new Error("render() requires an <App> element as the root");
  }

  const { port, children } = element.props;

  console.log(`[express-jsx-core] Starting server on port ${port}...`);

  // TODO: Implement actual server startup
  // This will:
  // 1. Parse the element tree to extract routes and middleware
  // 2. Build a routing table
  // 3. Start an HTTP server (using node:http or a framework like Hono)
  // 4. Handle requests by rendering the appropriate route components

  console.log(`[express-jsx-core] Server listening on http://localhost:${port}`);
}

/**
 * Render a route handler to JSON
 *
 * Takes a Response element and returns the JSON body.
 */
export function renderToJson(element: ExpressJsxElement): unknown {
  // TODO: Implement JSON rendering
  // This will:
  // 1. Walk the element tree
  // 2. Collect Field elements
  // 3. Build the JSON object

  return {};
}
