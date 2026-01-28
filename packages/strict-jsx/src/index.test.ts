/**
 * Tests for strict-jsx transformer
 */

import { describe, it, expect } from "vitest";
import * as ts from "typescript";

// Import the transformer internals for testing
import {
  transformSourceFile,
  transformWithMapping,
  mapOriginalToTransformed,
  mapTransformedToOriginal,
  findImportInsertPosition,
} from "./index.js";

describe("strict-jsx transformer", () => {
  function transform(code: string): string {
    const sourceFile = ts.createSourceFile(
      "test.tsx",
      code,
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TSX,
    );
    return transformSourceFile(sourceFile, ts);
  }

  describe("self-closing elements", () => {
    it("transforms simple self-closing element", () => {
      const input = `<Field name="id" />`;
      const output = transform(input);
      expect(output).toContain(`jsx(Field, { name: "id" })`);
    });

    it("transforms self-closing element with no props", () => {
      const input = `<Component />`;
      const output = transform(input);
      expect(output).toContain(`jsx(Component, null)`);
    });

    it("transforms self-closing element with multiple props", () => {
      const input = `<Field name="email" required type="string" />`;
      const output = transform(input);
      expect(output).toContain(
        `jsx(Field, { name: "email", required: true, type: "string" })`,
      );
    });

    it("transforms self-closing element with expression props", () => {
      const input = `<Field name={fieldName} value={123} />`;
      const output = transform(input);
      expect(output).toContain(`jsx(Field, { name: fieldName, value: 123 })`);
    });

    it("transforms self-closing element with spread props", () => {
      const input = `<Field {...props} name="id" />`;
      const output = transform(input);
      expect(output).toContain(`jsx(Field, { ...props, name: "id" })`);
    });
  });

  describe("elements with children", () => {
    it("transforms element with single expression child", () => {
      const input = `<Field name="id">{123}</Field>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Field, { name: "id" }, 123)`);
    });

    it("transforms element with string child", () => {
      const input = `<Field name="title">Hello World</Field>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Field, { name: "title" }, "Hello World")`);
    });

    it("transforms element with multiple children", () => {
      const input = `<Container>{child1}{child2}</Container>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Container, null, child1, child2)`);
    });

    it("transforms element with variable expression child", () => {
      const input = `<Field name="count">{myValue}</Field>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Field, { name: "count" }, myValue)`);
    });
  });

  describe("nested elements", () => {
    it("transforms nested self-closing elements", () => {
      const input = `<Router><Route path="/" /></Router>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Router, null, jsx(Route, { path: "/" }))`);
    });

    it("transforms deeply nested elements", () => {
      const input = `<App><Router><Route path="/" /></Router></App>`;
      const output = transform(input);
      expect(output).toContain("jsx(App,");
      expect(output).toContain("jsx(Router,");
      expect(output).toContain("jsx(Route,");
    });
  });

  describe("no auto-import", () => {
    it("does NOT add jsx import (user must import themselves)", () => {
      const input = `<Field name="id" />`;
      const output = transform(input);
      expect(output).not.toContain(`import { jsx }`);
    });

    it("preserves existing jsx import", () => {
      const input = `import { jsx } from "my-lib";\n<Field name="id" />`;
      const output = transform(input);
      expect(output).toContain(`import { jsx } from "my-lib"`);
    });

    it("does not modify code when no JSX present", () => {
      const input = `const x = 1;`;
      const output = transform(input);
      expect(output).toBe(input);
    });
  });

  describe("props extraction", () => {
    it("handles boolean attributes (no value)", () => {
      const input = `<Input required disabled />`;
      const output = transform(input);
      expect(output).toContain(`required: true`);
      expect(output).toContain(`disabled: true`);
    });

    it("handles string literal props", () => {
      const input = `<Field name="username" type="string" />`;
      const output = transform(input);
      expect(output).toContain(`name: "username"`);
      expect(output).toContain(`type: "string"`);
    });

    it("handles numeric expression props", () => {
      const input = `<Field min={0} max={100} />`;
      const output = transform(input);
      expect(output).toContain(`min: 0`);
      expect(output).toContain(`max: 100`);
    });

    it("handles object expression props", () => {
      const input = `<Field style={{ color: "red" }} />`;
      const output = transform(input);
      expect(output).toContain(`style: { color: "red" }`);
    });

    it("handles function expression props", () => {
      const input = `<Button onClick={() => console.log("clicked")} />`;
      const output = transform(input);
      expect(output).toContain(`onClick: () => console.log("clicked")`);
    });
  });

  describe("fragments", () => {
    it("transforms empty fragment", () => {
      const input = `<></>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Fragment, null)`);
    });

    it("transforms fragment with children", () => {
      const input = `<><Child1 /><Child2 /></>`;
      const output = transform(input);
      expect(output).toContain(
        `jsx(Fragment, null, jsx(Child1, null), jsx(Child2, null))`,
      );
    });

    it("transforms fragment with expression children", () => {
      const input = `<>{item1}{item2}</>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Fragment, null, item1, item2)`);
    });

    it("transforms nested fragment", () => {
      const input = `<Container><><Inner /></></Container>`;
      const output = transform(input);
      expect(output).toContain(
        `jsx(Container, null, jsx(Fragment, null, jsx(Inner, null)))`,
      );
    });
  });

  describe("member expressions", () => {
    it("transforms member expression tag name", () => {
      const input = `<NaturalNumber.add />`;
      const output = transform(input);
      expect(output).toContain(`jsx(NaturalNumber.add, null)`);
    });

    it("transforms nested member expression tag name", () => {
      const input = `<Foo.Bar.Baz value={123} />`;
      const output = transform(input);
      expect(output).toContain(`jsx(Foo.Bar.Baz, { value: 123 })`);
    });

    it("transforms member expression with children", () => {
      const input = `<Context.Provider value={ctx}><Child /></Context.Provider>`;
      const output = transform(input);
      expect(output).toContain(
        `jsx(Context.Provider, { value: ctx }, jsx(Child, null))`,
      );
    });

    it("tracks child expression positions in mapping", () => {
      const input = `<Handler>{CreateTodo}</Handler>`;
      const sourceFile = ts.createSourceFile(
        "test.tsx",
        input,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TSX,
      );
      const { mapping } = transformWithMapping(sourceFile, ts);

      // Should have one replacement
      expect(mapping.replacements.length).toBe(1);
      const r = mapping.replacements[0];

      // Should have child expression info
      expect(r.childExpressions).toBeDefined();
      expect(r.childExpressions!.length).toBe(1);

      const ce = r.childExpressions![0];
      // CreateTodo starts after "<Handler>{" (10 chars) at position 10
      expect(ce.originalStart).toBe(10);
      expect(ce.originalEnd).toBe(20); // "CreateTodo" is 10 chars

      // In transformed "jsx(Handler, null, CreateTodo)", CreateTodo starts at position 19
      // "jsx(Handler, null, " = 19 chars
      expect(ce.transformedStart).toBe(19);
    });

    it("mapOriginalToTransformed correctly maps child expression positions", () => {
      const input = `<Handler>{CreateTodo}</Handler>`;
      const sourceFile = ts.createSourceFile(
        "test.tsx",
        input,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TSX,
      );
      const { mapping } = transformWithMapping(sourceFile, ts);

      // Position 10 is start of "CreateTodo" in original
      // Should map to position 19 in transformed
      expect(mapOriginalToTransformed(10, mapping)).toBe(19);

      // Position 15 is middle of "CreateTodo" (5 chars in)
      // Should map to 19 + 5 = 24 in transformed
      expect(mapOriginalToTransformed(15, mapping)).toBe(24);
    });

    it("tracks property positions in mapping for member expressions", () => {
      const input = `<NaturalNumber.add />`;
      const sourceFile = ts.createSourceFile(
        "test.tsx",
        input,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TSX,
      );
      const { mapping } = transformWithMapping(sourceFile, ts);

      // Should have one replacement
      expect(mapping.replacements.length).toBe(1);
      const r = mapping.replacements[0];

      // Should have property position info
      expect(r.originalPropertyStart).toBeDefined();
      expect(r.originalPropertyEnd).toBeDefined();
      expect(r.transformedPropertyStart).toBeDefined();

      // Property "add" starts after "NaturalNumber." in "<NaturalNumber.add />"
      // Position: 1 for "<" + 13 for "NaturalNumber" + 1 for "." = 15
      expect(r.originalPropertyStart).toBe(15);
      expect(r.originalPropertyEnd).toBe(18); // "add" is 3 chars (15, 16, 17)

      // In transformed "jsx(NaturalNumber.add, null)", tag starts at 4, property at 4+14=18
      // propertyOffset is relative to tag start: 15 - 1 = 14 (1 is the "<" before tag)
      expect(r.transformedPropertyStart).toBe(4 + 14);
    });
  });

  describe("edge cases", () => {
    it("preserves non-JSX code", () => {
      const input = `const x = 1;\nconst y = "hello";\n<Field name="id" />`;
      const output = transform(input);
      expect(output).toContain(`const x = 1;`);
      expect(output).toContain(`const y = "hello";`);
    });

    it("handles empty element", () => {
      const input = `<Container></Container>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Container, null)`);
    });

    it("handles whitespace-only children", () => {
      const input = `<Container>   </Container>`;
      const output = transform(input);
      // Whitespace-only text should be trimmed, resulting in no children
      expect(output).toContain(`jsx(Container, null)`);
    });

    it("handles mixed children (text and expressions)", () => {
      const input = `<Label>Name: {value}</Label>`;
      const output = transform(input);
      expect(output).toContain(`jsx(Label, null, "Name:", value)`);
    });

    it("handles spread children", () => {
      const input = `<List>{...items}</List>`;
      const output = transform(input);
      expect(output).toContain(`jsx(List, null, ...items)`);
    });

    it("escapes quotes in string attributes", () => {
      const input = `<Field name='say "hello"' />`;
      const output = transform(input);
      expect(output).toContain(`jsx(Field, { name: "say \\"hello\\"" })`);
    });

    it("preserves backslashes in string attributes", () => {
      const input = String.raw`<Field path="C:\Users\test" />`;
      const output = transform(input);
      // TS parser gives .text as unescaped, JSON.stringify re-escapes
      expect(output).toContain(String.raw`{ path: "C:\\Users\\test" }`);
    });

    it("escapes quotes in text children", () => {
      const input = `<Label>say "hello"</Label>`;
      const output = transform(input);
      expect(output).toContain(`"say \\"hello\\""`);
    });

    it("escapes newlines in text children", () => {
      const input = `<Label>line1\nline2</Label>`;
      const output = transform(input);
      // Should not contain a raw newline inside the string literal
      expect(output).not.toMatch(/"[^"]*\n[^"]*"/);
    });
  });

  describe("import offset position mapping", () => {
    it("does not apply importOffset to positions before importInsertPos", () => {
      // Simulate a file with imports followed by JSX
      const input = `import { jsx } from "my-lib";\nimport { createContext } from "other";\n<Field name="id" />`;
      const sourceFile = ts.createSourceFile(
        "test.tsx",
        input,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TSX,
      );
      const { mapping } = transformWithMapping(sourceFile, ts);

      // The import insert position is after all imports
      const insertPos = findImportInsertPosition(sourceFile, ts);

      // Add a fake importOffset to the mapping (simulating injected imports)
      const mappingWithOffset = {
        ...mapping,
        importOffset: 50,
        importInsertPos: insertPos,
      };

      // Position 10 is inside the first import line (before insertPos)
      // It should NOT have importOffset applied
      const mapped = mapOriginalToTransformed(10, mappingWithOffset);
      expect(mapped).toBe(10); // No offset for positions before insert point

      // Position at insertPos should have importOffset applied
      const mappedAfter = mapOriginalToTransformed(insertPos, mappingWithOffset);
      expect(mappedAfter).toBe(insertPos + 50);
    });

    it("mapTransformedToOriginal does not subtract importOffset for positions before injection point", () => {
      const input = `import { jsx } from "my-lib";\n<Field name="id" />`;
      const sourceFile = ts.createSourceFile(
        "test.tsx",
        input,
        ts.ScriptTarget.ESNext,
        true,
        ts.ScriptKind.TSX,
      );
      const { mapping } = transformWithMapping(sourceFile, ts);
      const insertPos = findImportInsertPosition(sourceFile, ts);

      const mappingWithOffset = {
        ...mapping,
        importOffset: 40,
        importInsertPos: insertPos,
      };

      // Position 5 in transformed (before injection point + offset)
      // Should NOT subtract importOffset
      const original = mapTransformedToOriginal(5, mappingWithOffset);
      expect(original).toBe(5);

      // Position well beyond injection point + offset
      // Should subtract importOffset
      const afterInject = insertPos + 40 + 5;
      const originalAfter = mapTransformedToOriginal(afterInject, mappingWithOffset);
      // Should map back to roughly insertPos + 5 (minus any JSX offset adjustments)
      expect(originalAfter).toBeLessThan(afterInject);
    });
  });
});
