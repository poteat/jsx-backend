/**
 * Context system for express-jsx-core
 *
 * Provides React-like context for passing data through the component tree,
 * backed by AsyncLocalStorage for request isolation.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, ExpressJsxNode, ExpressJsxElement } from "./types.js";

// =============================================================================
// Request Context (internal)
// =============================================================================

interface RequestContext {
  request: Request;
  contexts: Map<Context<unknown>, unknown>;
}

const requestStorage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestStorage.getStore();
}

export function runWithRequestContext<T>(request: Request, fn: () => T): T {
  return requestStorage.run({ request, contexts: new Map() }, fn);
}

// =============================================================================
// User-facing Context API
// =============================================================================

const CONTEXT_SYMBOL = Symbol.for("express-jsx-core.context");

export interface Context<T> {
  $$typeof: typeof CONTEXT_SYMBOL;
  defaultValue: T;
  Provider: (props: { value: T; children?: ExpressJsxNode }) => ExpressJsxElement;
}

// Symbol for context provider elements
const PROVIDER_SYMBOL = Symbol.for("express-jsx-core.element");

/**
 * Create a new context
 */
export function createContext<T>(defaultValue: T): Context<T> {
  const Provider = ({ value, children }: { value: T; children?: ExpressJsxNode }) => {
    const ctx = getRequestContext();
    if (ctx) {
      ctx.contexts.set(context as Context<unknown>, value);
    }
    // Return a proper element that wraps children
    return {
      $$typeof: PROVIDER_SYMBOL,
      type: Provider,
      props: { value, children },
      key: null,
    } as ExpressJsxElement;
  };

  const context: Context<T> = {
    $$typeof: CONTEXT_SYMBOL,
    defaultValue,
    Provider,
  };
  return context;
}

/**
 * Get the current value of a context
 */
export function useContext<T>(context: Context<T>): T {
  const ctx = getRequestContext();
  if (ctx && ctx.contexts.has(context as Context<unknown>)) {
    return ctx.contexts.get(context as Context<unknown>) as T;
  }
  return context.defaultValue;
}
