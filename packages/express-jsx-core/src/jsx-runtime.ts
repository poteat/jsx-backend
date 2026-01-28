/**
 * JSX Runtime for express-jsx-core
 *
 * This module provides the jsx/jsxs functions that TypeScript's JSX transform calls.
 * Uses function overloads to preserve literal types for Field and Response components.
 */

import type { ZodType, infer as ZodInfer } from "zod";
import type {
  ExpressJsxElement,
  ExpressJsxNode,
  FieldElement,
  MergeFields,
  InputHandler,
  NoInputHandler,
  RequestElement,
  ResponseElement,
  HandlerElement,
  MiddlewareFn,
  MiddlewareElement,
  GetElement,
  PostElement,
  PutElement,
  PatchElement,
  DeleteElement,
  OkElement,
  ErrElement,
} from "./types.js";

const EXPRESS_JSX_ELEMENT = Symbol.for("express-jsx-core.element");

// Field component marker
export const Field = Symbol.for("express-jsx-core.Field");
export type Field = typeof Field;

// HTTP method component markers
export const Get = Symbol.for("express-jsx-core.Get");
export type Get = typeof Get;

export const Post = Symbol.for("express-jsx-core.Post");
export type Post = typeof Post;

export const Put = Symbol.for("express-jsx-core.Put");
export type Put = typeof Put;

export const Patch = Symbol.for("express-jsx-core.Patch");
export type Patch = typeof Patch;

export const Delete = Symbol.for("express-jsx-core.Delete");
export type Delete = typeof Delete;

// Schema markers for Request/Response/Handler
export const Request = Symbol.for("express-jsx-core.Request");
export type Request = typeof Request;

export const Response = Symbol.for("express-jsx-core.Response");
export type Response = typeof Response;

export const Handler = Symbol.for("express-jsx-core.Handler");
export type Handler = typeof Handler;

// Middleware marker
export const Middleware = Symbol.for("express-jsx-core.Middleware");
export type Middleware = typeof Middleware;

// Response status markers
export const Ok = Symbol.for("express-jsx-core.Ok");
export type Ok = typeof Ok;

export const Err = Symbol.for("express-jsx-core.Err");
export type Err = typeof Err;

// =============================================================================
// Type Utilities for Validation
// =============================================================================

/**
 * Extract request schema from method children
 */
type ExtractRequest<C extends unknown[]> = C extends [RequestElement<infer S>, ...unknown[]]
  ? S
  : C extends [unknown, ...infer Rest]
    ? ExtractRequest<Rest>
    : undefined;

/**
 * Extract response schema from method children
 */
type ExtractResponse<C extends unknown[]> = C extends [ResponseElement<infer S>, ...unknown[]]
  ? S
  : C extends [unknown, ...infer Rest]
    ? ExtractResponse<Rest>
    : undefined;

/**
 * Extract handler from method children (HandlerElement)
 */
type ExtractHandler<C extends unknown[]> = C extends [HandlerElement<infer H>, ...unknown[]]
  ? H
  : C extends [unknown, ...infer Rest]
    ? ExtractHandler<Rest>
    : never;

/**
 * Validate that handler matches request schema
 */
type ValidateMethodChildren<C extends unknown[]> =
  ExtractRequest<C> extends ZodType
    ? ExtractHandler<C> extends InputHandler<ExtractRequest<C>>
      ? C
      : ["Handler must match Request schema"]
    : ExtractHandler<C> extends NoInputHandler
      ? C
      : C; // Allow any handler if no request

// =============================================================================
// JSX Function Overloads
// =============================================================================

/**
 * Field overload - preserves literal name and value types
 * <Field name="id">{123}</Field> -> jsx(Field, { name: "id" }, 123)
 */
export function jsx<const K extends string, const V>(
  type: Field,
  props: { name: K } | null,
  ...children: [V]
): FieldElement<K, V>;

/**
 * Request schema element
 * <Request>{Schema}</Request>
 */
export function jsx<S extends ZodType>(
  type: Request,
  props: null,
  ...children: [S]
): RequestElement<S>;

/**
 * Response schema element
 * <Response>{Schema}</Response>
 */
export function jsx<S extends ZodType>(
  type: Response,
  props: null,
  ...children: [S]
): ResponseElement<S>;

/**
 * Handler element
 * <Handler>{HandlerFn}</Handler>
 */
export function jsx<H extends Function>(
  type: Handler,
  props: null,
  ...children: [H]
): HandlerElement<H>;

/**
 * Middleware element
 * <Middleware>{MiddlewareFn}</Middleware>
 */
export function jsx<F extends MiddlewareFn>(
  type: Middleware,
  props: null,
  ...children: [F]
): MiddlewareElement<F>;

/**
 * HTTP GET with Request/Response children and handler
 * <Get><Request>{Schema}</Request><Response>{Schema}</Response><Handler>{Fn}</Handler></Get>
 */
export function jsx<const C extends unknown[]>(
  type: Get,
  props: null,
  ...children: ValidateMethodChildren<C>
): GetElement<ExtractRequest<C>, ExtractResponse<C>>;

/**
 * HTTP POST with Request/Response children and handler
 */
export function jsx<const C extends unknown[]>(
  type: Post,
  props: null,
  ...children: ValidateMethodChildren<C>
): PostElement<ExtractRequest<C>, ExtractResponse<C>>;

/**
 * HTTP PUT with Request/Response children and handler
 */
export function jsx<const C extends unknown[]>(
  type: Put,
  props: null,
  ...children: ValidateMethodChildren<C>
): PutElement<ExtractRequest<C>, ExtractResponse<C>>;

/**
 * HTTP PATCH with Request/Response children and handler
 */
export function jsx<const C extends unknown[]>(
  type: Patch,
  props: null,
  ...children: ValidateMethodChildren<C>
): PatchElement<ExtractRequest<C>, ExtractResponse<C>>;

/**
 * HTTP DELETE with Request/Response children and handler
 */
export function jsx<const C extends unknown[]>(
  type: Delete,
  props: null,
  ...children: ValidateMethodChildren<C>
): DeleteElement<ExtractRequest<C>, ExtractResponse<C>>;

/**
 * Ok response (2xx) - used inside handlers
 * <Ok>{...fields}</Ok> or <Ok status={201}>{...fields}</Ok>
 * Preserves Field types for type-safe response bodies
 */
export function jsx<const C extends unknown[]>(
  type: Ok,
  props: { status?: number } | null,
  ...children: C
): OkElement<C>;

/**
 * Err response (4xx/5xx) - used inside handlers
 * <Err status={404}>{...fields}</Err>
 * Preserves Field types for type-safe error bodies
 */
export function jsx<const C extends unknown[]>(
  type: Err,
  props: { status: number },
  ...children: C
): ErrElement<C>;

/**
 * Generic fallback for other components
 */
export function jsx<const P extends object | null>(
  type: string | ((props: P) => ExpressJsxElement),
  props: P,
  ...restChildren: unknown[]
): ExpressJsxElement<P>;

/**
 * Implementation
 */
export function jsx(type: unknown, props: unknown, ...restChildren: unknown[]): ExpressJsxElement {
  let finalProps = (props ?? {}) as Record<string, unknown>;

  if (restChildren.length > 0) {
    const children = restChildren.length === 1 ? restChildren[0] : restChildren;
    finalProps = { ...finalProps, children };
  }

  return {
    $$typeof: EXPRESS_JSX_ELEMENT,
    type: type as string | Function,
    props: finalProps,
    key: null,
  };
}

/**
 * JSX runtime for elements with multiple children (static children)
 */
export const jsxs = jsx;

/**
 * Fragment - groups children without adding structure
 */
export function Fragment(props: { children?: ExpressJsxNode }): ExpressJsxElement {
  return {
    $$typeof: EXPRESS_JSX_ELEMENT,
    type: Fragment,
    props,
    key: null,
  };
}

/**
 * Check if a value is a express-jsx-core element
 */
export function isExpressJsxElement(value: unknown): value is ExpressJsxElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as ExpressJsxElement).$$typeof === EXPRESS_JSX_ELEMENT
  );
}

/**
 * Check if an element is a Field element
 */
export function isFieldElement(value: unknown): value is FieldElement {
  return isExpressJsxElement(value) && value.type === Field;
}

/**
 * Check if an element is a Request element
 */
export function isRequestElement(value: unknown): value is RequestElement {
  return isExpressJsxElement(value) && value.type === Request;
}

/**
 * Check if an element is a Response element
 */
export function isResponseElement(value: unknown): value is ResponseElement {
  return isExpressJsxElement(value) && value.type === Response;
}

// =============================================================================
// JSX Namespace (for TypeScript)
// =============================================================================

export namespace JSX {
  export interface Element extends ExpressJsxElement<unknown> {}

  export interface ElementChildrenAttribute {
    children: {};
  }

  export interface IntrinsicElements {
    // No intrinsic elements - all components are functions
  }
}
