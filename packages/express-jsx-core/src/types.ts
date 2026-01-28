/**
 * Core types for express-jsx-core
 */

import type { ZodType, infer as ZodInfer } from "zod";

// =============================================================================
// JSX Element Types
// =============================================================================

export interface ExpressJsxElement<P = unknown> {
  $$typeof: symbol;
  type: string | Function | symbol;
  props: P;
  key: string | null;
}

export type ExpressJsxNode =
  | ExpressJsxElement
  | string
  | number
  | boolean
  | null
  | undefined
  | ExpressJsxNode[];

// =============================================================================
// Field Types - Branded element that carries key/value type information
// =============================================================================

export interface FieldProps<K extends string = string, V = unknown> {
  name: K;
  children: V;
}

/** Branded Field element that preserves key/value types */
export interface FieldElement<K extends string = string, V = unknown> extends ExpressJsxElement<
  FieldProps<K, V>
> {
  __brand: "FieldElement";
  __key: K;
  __value: V;
}

// =============================================================================
// Type Utilities for Field Merging
// =============================================================================

/** Extract key-value pair from a FieldElement */
type FieldToRecord<F> = F extends FieldElement<infer K, infer V> ? { [P in K]: V } : {};

/** Merge multiple FieldElements into a single record type */
export type MergeFields<T extends unknown[]> = T extends [infer First, ...infer Rest]
  ? FieldToRecord<First> & MergeFields<Rest>
  : {};

// =============================================================================
// Request/Response Schema Elements
// =============================================================================

export interface RequestElementProps<S extends ZodType = ZodType> {
  children: S;
}

export interface RequestElement<S extends ZodType = ZodType> extends ExpressJsxElement<
  RequestElementProps<S>
> {
  __brand: "RequestElement";
  __schema: S;
}

export interface ResponseElementProps<S extends ZodType = ZodType> {
  children: S;
}

export interface ResponseElement<S extends ZodType = ZodType> extends ExpressJsxElement<
  ResponseElementProps<S>
> {
  __brand: "ResponseElement";
  __schema: S;
}

export interface HandlerElementProps<H extends Function = Function> {
  children: H;
}

export interface HandlerElement<H extends Function = Function> extends ExpressJsxElement<
  HandlerElementProps<H>
> {
  __brand: "HandlerElement";
  __handler: H;
}

// =============================================================================
// HTTP Method Types
// =============================================================================

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** Handler that receives flat validated input data */
export type InputHandler<T extends ZodType> = (
  data: ZodInfer<T>,
) => ExpressJsxNode | Promise<ExpressJsxNode>;

/** Handler with no input schema */
export type NoInputHandler = () => ExpressJsxNode | Promise<ExpressJsxNode>;

/** Props for HTTP method elements - children are Input/Output elements and handler */
export interface MethodElementProps<
  I extends ZodType | undefined = undefined,
  O extends ZodType | undefined = undefined,
> {
  children: unknown; // Input/Output elements + handler function
}

/** Branded HTTP method element with schema types for introspection */
export interface MethodElement<
  M extends HttpMethod = HttpMethod,
  I extends ZodType | undefined = undefined,
  O extends ZodType | undefined = undefined,
> extends ExpressJsxElement<MethodElementProps<I, O>> {
  __brand: "MethodElement";
  __method: M;
  __input: I;
  __output: O;
}

// Specific method element types
export type GetElement<
  I extends ZodType | undefined = undefined,
  O extends ZodType | undefined = undefined,
> = MethodElement<"get", I, O>;

export type PostElement<
  I extends ZodType | undefined = undefined,
  O extends ZodType | undefined = undefined,
> = MethodElement<"post", I, O>;

export type PutElement<
  I extends ZodType | undefined = undefined,
  O extends ZodType | undefined = undefined,
> = MethodElement<"put", I, O>;

export type PatchElement<
  I extends ZodType | undefined = undefined,
  O extends ZodType | undefined = undefined,
> = MethodElement<"patch", I, O>;

export type DeleteElement<
  I extends ZodType | undefined = undefined,
  O extends ZodType | undefined = undefined,
> = MethodElement<"delete", I, O>;

// =============================================================================
// Response Status Types (Ok, Error)
// =============================================================================

export interface OkProps<C extends unknown[] = unknown[]> {
  status?: number; // defaults to 200
  children?: C;
}

export interface OkElement<C extends unknown[] = unknown[]> extends ExpressJsxElement<OkProps<C>> {
  __brand: "OkElement";
  __children: C;
  __fields: MergeFields<C>;
}

export interface ErrProps<C extends unknown[] = unknown[]> {
  status: number; // 4xx or 5xx
  children?: C;
}

export interface ErrElement<C extends unknown[] = unknown[]> extends ExpressJsxElement<ErrProps<C>> {
  __brand: "ErrElement";
  __children: C;
  __fields: MergeFields<C>;
}

// =============================================================================
// Component Props
// =============================================================================

export interface RouteProps {
  path: string;
  children?: ExpressJsxNode;
}

/** @deprecated Use RouteProps instead */
export type RouterProps = RouteProps;

export type MiddlewareFn = (props: { req: Request; next: () => ExpressJsxNode }) => ExpressJsxNode;

export interface MiddlewareProps {
  children: MiddlewareFn;
}

export interface MiddlewareElement<
  F extends MiddlewareFn = MiddlewareFn,
> extends ExpressJsxElement<MiddlewareProps> {
  __brand: "MiddlewareElement";
  __fn: F;
}

export interface AppProps {
  port: number;
  children?: ExpressJsxNode;
}

// =============================================================================
// Request Types
// =============================================================================

export interface Request {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  headers: Record<string, string>;
  ip: string;
  [key: string]: unknown; // Allow middleware to attach data
}

// =============================================================================
// Handler Types
// =============================================================================

/** Legacy handler type (no typed request) */
export type RouteHandler = () => ExpressJsxNode | Promise<ExpressJsxNode>;

export type MiddlewareHandler = (props: {
  req: Request;
  next: () => ExpressJsxNode;
}) => ExpressJsxNode;
