/**
 * Example: Using JSX syntax for HKT expressions
 *
 * This demonstrates how strict-jsx enables a more visual/hierarchical
 * syntax for expressing higher-kinded type operations.
 *
 * The jsx function is isomorphic to hkt-toolbelt's $ operator:
 *   <K>{arg}</K>  ≡  $<K, arg>  ≡  K(arg)
 */

import { Kind, List, NaturalNumber, String } from "hkt-toolbelt";
import { jsx } from "./jsx-runtime.js";

// ============================================================================
// Basic Kind Application
// ============================================================================

// With JSX syntax - equivalent to $<NaturalNumber.add, 1>:
const addOne = <NaturalNumber.add>{1}</NaturalNumber.add>;
// const addOne = jsx(NaturalNumber.add, {}, 1);

// Use it - addOne is now a function that adds 1:
const five = addOne(4); // 1 + 4 = 5
console.log("addOne(4) =", five);

// ============================================================================
// Nested Kind Application (Composition)
// ============================================================================

// With JSX - the nesting is visual:
const mapAddOne = (
  <List.map>
    <NaturalNumber.add>{1}</NaturalNumber.add>
  </List.map>
);

// Use it - maps addOne over a list:
const mapped = mapAddOne([1, 2, 3]); // [2, 3, 4]
console.log("mapAddOne([1, 2, 3]) =", mapped);

const extractRouteParams = (
  <Kind.lazyPipe>
    <String.split>{"/"}</String.split>
    <List.filter>
      <String.startsWith>{":"}</String.startsWith>
    </List.filter>
    <List.map>
      <String.tail />
    </List.map>
  </Kind.lazyPipe>
);

const foob = extractRouteParams("/users/:userId/posts/:postId");

// ============================================================================
// Pipeline Pattern
// ============================================================================

// Kind.pipe composes kinds left-to-right.
// With JSX - reads top-to-bottom:
const pipeline = (
  <Kind.pipe>
    <List.map>
      <NaturalNumber.add>{1}</NaturalNumber.add>
    </List.map>
    <List.filter>
      <NaturalNumber.isEven />
    </List.filter>
  </Kind.pipe>
);

// Use it: adds 1 to each, then filters to even numbers
const result = pipeline([1, 2, 3, 4]); // [2, 4] - (2 and 4 after adding 1)
console.log("pipeline([1, 2, 3, 4]) =", result);

// ============================================================================
// String Operations
// ============================================================================

const appendBang = <String.append>{"!"}</String.append>;
const excited = appendBang("hello"); // "hello!"
console.log('appendBang("hello") =', excited);

const stringPipeline = (
  <Kind.pipe>
    <String.append>{"!"}</String.append>
    <String.toUpper />
  </Kind.pipe>
);

const shout = stringPipeline("hello"); // "HELLO!"
console.log('stringPipeline("hello") =', shout);
