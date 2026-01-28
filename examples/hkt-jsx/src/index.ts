/**
 * hkt-jsx
 *
 * Example package demonstrating strict-jsx with hkt-toolbelt.
 *
 * JSX provides a visual syntax for expressing HKT compositions:
 *
 *   Traditional:  $<typeof List.map, $<typeof NaturalNumber.add, 1>>
 *
 *   JSX:
 *     <List.map>
 *       <NaturalNumber.add>{1}</NaturalNumber.add>
 *     </List.map>
 *
 * The nesting naturally represents Kind application/composition.
 */

export * from "./jsx-runtime.js";
export * from "./example.js";
