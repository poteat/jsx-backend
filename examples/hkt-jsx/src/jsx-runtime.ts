/**
 * JSX Runtime for HKT expressions
 *
 * Maps JSX syntax to hkt-toolbelt Kind application, isomorphic to the $ operator.
 * Uses React.createElement-style signature: jsx(kind, props, ...children)
 *
 * Semantics:
 * - 0 children: return the kind as-is (for use as a value)
 * - 1 child: apply directly: kind(child) ≡ $<K, child>
 * - N children: pass as array: kind(children) ≡ $<K, children>
 *
 * Examples:
 *   <NaturalNumber.add>{1}</NaturalNumber.add>  -> jsx(NaturalNumber.add, null, 1)
 *   <Kind.pipe><A /><B /></Kind.pipe>           -> jsx(Kind.pipe, null, A, B)
 */
import { type $, type Kind } from "hkt-toolbelt";

/**
 * Type-level application based on children count:
 * - 0 children: K (unchanged)
 * - Children as array matches input type: $<K, C> (e.g., Kind.pipe expects Kind[])
 * - Single child matches input type: $<K, C[0]> (e.g., NaturalNumber.add expects number)
 */
type Apply<K, C extends unknown[]> = C extends []
  ? K
  : K extends Kind.Kind
    ? C extends Kind._$inputOf<K>
      ? // Children array directly matches input type
        $<K, C> extends infer Result
        ? Result extends Kind.Kind
          ? Kind._$reify<Result>
          : Result
        : never
      : // Try unwrapping single child
        C extends [infer Only]
        ? Only extends Kind._$inputOf<K>
          ? $<K, Only> extends infer Result
            ? Result extends Kind.Kind
              ? Kind._$reify<Result>
              : Result
            : never
          : K
        : K
    : K;

/**
 * React-style props with children (for TypeScript's built-in JSX transform)
 */
type PropsWithChildren<P, C> = P & { children?: C };

/**
 * The jsx function for HKT expressions.
 *
 * Overload order matters! TypeScript tries overloads in order.
 * React-style (children in props) must come before generic object props
 * to ensure { children: X } matches the specific overload.
 */
// Overload for rest-style children with null props - used by our ts-patch transform
export function jsx<const K extends Kind.Kind, const C extends unknown[]>(
  kind: K,
  props: null,
  ...children: C
): Apply<K, C>;

// Overload for React-style (children in props) - used by TypeScript's built-in JSX
// MUST come before the generic object props overload!
export function jsx<const K extends Kind.Kind, const C>(
  kind: K,
  props: { children: C },
): Apply<K, C extends unknown[] ? C : [C]>;

// Overload for no children (null or empty object)
export function jsx<const K extends Kind.Kind>(kind: K, props: null | {}): K;

// Overload for rest-style with props object (catch-all for transform with props)
export function jsx<const K extends Kind.Kind, const P extends object, const C extends unknown[]>(
  kind: K,
  props: P,
  ...children: C
): Apply<K, C>;

// Implementation
export function jsx(
  kind: Kind.Kind,
  props: { children?: unknown } | null,
  ...restChildren: unknown[]
): unknown {
  // Determine children from either props.children or rest params
  let children: unknown[];
  if (restChildren.length > 0) {
    children = restChildren;
  } else if (props && "children" in props && props.children !== undefined) {
    children = Array.isArray(props.children) ? props.children : [props.children];
  } else {
    children = [];
  }

  const apply = kind as unknown as (x: unknown) => unknown;
  if (children.length === 0) {
    return kind;
  } else if (children.length === 1) {
    return apply(children[0]);
  } else {
    return apply(children);
  }
}
