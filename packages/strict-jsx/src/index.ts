/*
 * strict-jsx
 *
 * A ts-patch Program Transformer that transforms JSX syntax to function calls.
 *
 * This allows custom jsx functions to preserve literal types via const type parameters:
 *   <Field name="id">{123}</Field>
 * Becomes:
 *   jsx(Field, { name: "id" }, 123)
 *
 * The jsx function can use const type parameters to preserve literal types:
 *   function jsx<T, const P, const C extends unknown[]>(tag: T, props: P, ...children: C): Element
 *
 * JSX Import Handling:
 * - If jsxImportSource is set in tsconfig (e.g., "express-jsx-core"), strict-jsx will auto-import:
 *     import { jsx } from "express-jsx-core/jsx-runtime";
 * - Otherwise, you must import jsx yourself from your chosen runtime.
 * - If you forget to import jsx (and no jsxImportSource), you'll get "Cannot find name 'jsx'" error.
 *
 * Usage in tsconfig.json:
 * {
 *   "compilerOptions": {
 *     "plugins": [
 *       {
 *         "name": "strict-jsx",
 *         "transform": "strict-jsx",
 *         "transformProgram": true
 *       }
 *     ]
 *   }
 * }
 *
 * Requires ts-patch:
 *   npm install ts-patch strict-jsx
 *   npx ts-patch install
 *   npx tspc (instead of tsc)
 */

import type ts from "typescript";

interface TransformerExtras {
  ts: typeof ts;
  addDiagnostic: (diag: ts.Diagnostic) => number;
}

interface ProgramTransformerExtras extends TransformerExtras {
  diagnostics: ts.Diagnostic[];
}

/**
 * Program Transformer entry point
 * Runs during ts.createProgram(), BEFORE type checking
 */
function transform(
  program: ts.Program,
  host: ts.CompilerHost | undefined,
  pluginConfig: Record<string, unknown>,
  extras: ProgramTransformerExtras,
): ts.Program {
  const { ts: typescript } = extras;
  const compilerOptions = program.getCompilerOptions();
  const compilerHost = host ?? typescript.createCompilerHost(compilerOptions);

  // Get all source files
  const sourceFiles = program.getSourceFiles();
  const transformedSources = new Map<string, string>();

  // Get jsxImportSource from compiler options
  const jsxImportSource = compilerOptions.jsxImportSource as string | undefined;

  // Cache resolved module exports to avoid redundant lookups
  const moduleExportsCache = new Map<string, Set<string> | undefined>();

  for (const sourceFile of sourceFiles) {
    if (sourceFile.isDeclarationFile) continue;
    if (!sourceFile.fileName.endsWith(".tsx")) continue;

    const transformed = transformSourceFile(
      sourceFile,
      typescript,
      jsxImportSource,
      program,
      moduleExportsCache,
    );
    if (transformed !== sourceFile.text) {
      transformedSources.set(sourceFile.fileName, transformed);
    }
  }

  if (transformedSources.size === 0) {
    return program;
  }

  // Create a new host that returns transformed source
  const newHost: ts.CompilerHost = {
    ...compilerHost,
    getSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile) {
      if (transformedSources.has(fileName)) {
        return typescript.createSourceFile(
          fileName,
          transformedSources.get(fileName)!,
          languageVersion,
          true,
        );
      }
      return compilerHost.getSourceFile(
        fileName,
        languageVersion,
        onError,
        shouldCreateNewSourceFile,
      );
    },
    readFile(fileName) {
      if (transformedSources.has(fileName)) {
        return transformedSources.get(fileName);
      }
      return compilerHost.readFile(fileName);
    },
  };

  // Create new program with transformed sources
  return typescript.createProgram(
    program.getRootFileNames(),
    compilerOptions,
    newHost,
    undefined,
    extras.diagnostics,
  );
}

/**
 * Position mapping for bidirectional original<->transformed position conversion
 */
export interface PositionMapping {
  /** JSX replacements, sorted by originalStart ascending */
  replacements: Array<{
    originalStart: number; // where the JSX element starts in original
    originalEnd: number; // where the JSX element ends in original
    originalTagStart: number; // where tag name starts in original (for hover detection)
    originalTagEnd: number; // where tag name ends in original
    transformedTagStart: number; // where tag name starts in transformed (for hover)
    isTopLevel: boolean; // true for top-level elements (used for offset calculation)
    transformedFullStart?: number; // where the jsx() call starts (only for top-level)
    transformedFullEnd?: number; // where the jsx() call ends (only for top-level)
    // For member expressions like Foo.bar, track the property "bar" separately
    originalPropertyStart?: number; // where property name starts in original
    originalPropertyEnd?: number; // where property name ends in original
    transformedPropertyStart?: number; // where property name starts in transformed
    // Child expression mappings (for {expr} children like {CreateTodo})
    childExpressions?: Array<{
      originalStart: number; // where expression starts in original
      originalEnd: number; // where expression ends in original
      transformedStart: number; // where expression starts in transformed
    }>;
  }>;
  /** Offset from import injections (only applied to positions >= importInsertPos) */
  importOffset?: number;
  /** Original position where imports were injected (positions before this are unaffected) */
  importInsertPos?: number;
}

/**
 * Convert a position in the original source to the corresponding position in transformed source
 */
export function mapOriginalToTransformed(pos: number, mapping: PositionMapping): number {
  const importInsertPos = mapping.importInsertPos ?? 0;
  const importOffset =
    (mapping.importOffset ?? 0) && pos >= importInsertPos ? mapping.importOffset! : 0;
  let offset = 0;
  let innermostTagMatch: { transformedTagStart: number; size: number } | null = null;
  let childExprMatch: {
    transformedStart: number;
    offsetInExpr: number;
  } | null = null;

  // Account for JSX replacements before this position
  for (const r of mapping.replacements) {
    if (pos < r.originalStart) {
      // Position is before this replacement
      break;
    } else if (pos >= r.originalEnd) {
      // Position is after this replacement - add the length difference (only for top-level)
      if (
        r.isTopLevel &&
        r.transformedFullStart !== undefined &&
        r.transformedFullEnd !== undefined
      ) {
        const originalLen = r.originalEnd - r.originalStart;
        const transformedLen = r.transformedFullEnd - r.transformedFullStart;
        offset += transformedLen - originalLen;
      }
    } else {
      // Position is inside a JSX node
      // Only remap to tag name if hovering on the actual tag name
      if (pos >= r.originalTagStart && pos < r.originalTagEnd) {
        const size = r.originalEnd - r.originalStart;
        if (!innermostTagMatch || size < innermostTagMatch.size) {
          innermostTagMatch = {
            transformedTagStart: r.transformedTagStart,
            size,
          };
        }
      }

      // Check if position is inside a child expression (like {CreateTodo})
      if (r.childExpressions) {
        for (const ce of r.childExpressions) {
          if (pos >= ce.originalStart && pos < ce.originalEnd) {
            // Position is inside this child expression
            // Calculate offset within the expression to preserve exact position
            const offsetInExpr = pos - ce.originalStart;
            const size = r.originalEnd - r.originalStart;
            if (!childExprMatch || size < childExprMatch.offsetInExpr) {
              childExprMatch = {
                transformedStart: ce.transformedStart,
                offsetInExpr,
              };
            }
          }
        }
      }
    }
  }

  // If hovering on a tag name, map to the transformed tag position
  if (innermostTagMatch) {
    return innermostTagMatch.transformedTagStart + importOffset;
  }

  // If hovering inside a child expression, map to the transformed expression position
  if (childExprMatch) {
    return childExprMatch.transformedStart + childExprMatch.offsetInExpr + importOffset;
  }

  // For other positions (children, etc.), apply cumulative offset
  return pos + offset + importOffset;
}

/**
 * Convert a position in the transformed source to the corresponding position in original source
 */
export function mapTransformedToOriginal(pos: number, mapping: PositionMapping): number {
  const importInsertPos = mapping.importInsertPos ?? 0;
  const rawImportOffset = mapping.importOffset ?? 0;
  // Only subtract import offset if the transformed position is beyond the injection point
  const importOffset =
    rawImportOffset && pos >= importInsertPos + rawImportOffset ? rawImportOffset : 0;
  // Adjust input position to account for import offset
  const adjustedPos = pos - importOffset;
  let offset = 0;
  let topLevelMatch: { originalStart: number; originalEnd: number } | null = null;

  // Account for JSX replacements (only top-level for offset calculation)
  for (const r of mapping.replacements) {
    if (
      !r.isTopLevel ||
      r.transformedFullStart === undefined ||
      r.transformedFullEnd === undefined
    ) {
      continue;
    }

    if (adjustedPos + offset < r.originalStart) {
      break;
    } else if (adjustedPos >= r.transformedFullEnd) {
      const originalLen = r.originalEnd - r.originalStart;
      const transformedLen = r.transformedFullEnd - r.transformedFullStart;
      offset -= transformedLen - originalLen;
    } else if (adjustedPos >= r.transformedFullStart) {
      topLevelMatch = { originalStart: r.originalStart, originalEnd: r.originalEnd };
    }
  }

  // If inside a top-level jsx() call, find the innermost nested element
  // whose transformed tag position is closest to our position
  if (topLevelMatch) {
    let bestMatch: { originalStart: number; distance: number } | null = null;
    for (const r of mapping.replacements) {
      // Only consider replacements nested within this top-level element
      if (
        r.originalStart < topLevelMatch.originalStart ||
        r.originalEnd > topLevelMatch.originalEnd
      ) {
        continue;
      }
      // transformedTagStart is relative to the top-level replacement's start,
      // offset by importOffset. Check if this tag is at or before our position.
      const tagStart = r.transformedTagStart + importOffset;
      if (tagStart <= pos) {
        const distance = pos - tagStart;
        if (!bestMatch || distance < bestMatch.distance) {
          bestMatch = { originalStart: r.originalTagStart, distance };
        }
      }
    }
    if (bestMatch) {
      return bestMatch.originalStart;
    }
    return topLevelMatch.originalStart;
  }

  return adjustedPos + offset;
}

/**
 * Transform JSX to direct function calls, returning both text and position mapping.
 * Does NOT handle jsx import - that's done in transformSourceFile.
 */
export function transformWithMapping(
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
): { text: string; mapping: PositionMapping } {
  const originalText = sourceFile.text;
  let result = originalText;

  // Track all JSX elements with their exact offset within the top-level replacement text.
  // Offsets are computed mathematically during transformation — no string searching needed.
  const allJsxElements: Array<{
    originalStart: number;
    originalEnd: number;
    originalTagStart: number;
    originalTagEnd: number;
    tagName: string;
    /** Offset of this element's "jsx(" within the top-level replacement text */
    offsetInTopLevel: number;
    propertyStart?: number;
    propertyEnd?: number;
    propertyOffset?: number;
    childExpressions?: Array<{
      originalStart: number;
      originalEnd: number;
      /** Offset of the expression within the top-level replacement text */
      offsetInTopLevel: number;
    }>;
  }> = [];

  /**
   * Transform a JSX node to a jsx() call string.
   * @param baseOffset - the character offset where this element's "jsx(" starts
   *                     within the top-level replacement text
   */
  function transformJsxNode(
    node: ts.JsxElement | ts.JsxSelfClosingElement,
    baseOffset: number = 0,
  ): string {
    const originalStart = node.getStart(sourceFile);
    const originalEnd = node.getEnd();

    if (typescript.isJsxElement(node)) {
      const openingElement = node.openingElement;
      const tagNameNode = openingElement.tagName;
      const tagName = tagNameNode.getText(sourceFile);
      const originalTagStart = tagNameNode.getStart(sourceFile);
      const originalTagEnd = tagNameNode.getEnd();
      const props = extractProps(openingElement.attributes, sourceFile, typescript);
      const propsArg = props ? `{ ${props} }` : "null";

      // Transform children, tracking offsets for nested jsx() calls
      // "jsx(tagName, propsArg" is the prefix before children
      const prefixLen = 4 + tagName.length + 2 + propsArg.length; // "jsx(" + tag + ", " + props
      const children = extractChildrenWithOffsets(
        node.children,
        sourceFile,
        typescript,
        baseOffset + prefixLen,
        allJsxElements,
        transformJsxNode,
      );

      const args = [tagName, propsArg, ...children.values].join(", ");
      const transformed = `jsx(${args})`;

      // Track this element
      const elemInfo: (typeof allJsxElements)[number] = {
        originalStart,
        originalEnd,
        originalTagStart,
        originalTagEnd,
        tagName,
        offsetInTopLevel: baseOffset,
      };

      if (typescript.isPropertyAccessExpression(tagNameNode)) {
        const propName = tagNameNode.name;
        elemInfo.propertyStart = propName.getStart(sourceFile);
        elemInfo.propertyEnd = propName.getEnd();
        elemInfo.propertyOffset = elemInfo.propertyStart - originalTagStart;
      }

      if (children.childExpressions.length > 0) {
        elemInfo.childExpressions = children.childExpressions;
      }

      allJsxElements.push(elemInfo);
      return transformed;
    } else {
      // Self-closing element
      const tagNameNode = node.tagName;
      const tagName = tagNameNode.getText(sourceFile);
      const originalTagStart = tagNameNode.getStart(sourceFile);
      const originalTagEnd = tagNameNode.getEnd();
      const props = extractProps(node.attributes, sourceFile, typescript);
      const propsArg = props ? `{ ${props} }` : "null";
      const transformed = `jsx(${tagName}, ${propsArg})`;

      const elemInfo: (typeof allJsxElements)[number] = {
        originalStart,
        originalEnd,
        originalTagStart,
        originalTagEnd,
        tagName,
        offsetInTopLevel: baseOffset,
      };

      if (typescript.isPropertyAccessExpression(tagNameNode)) {
        const propName = tagNameNode.name;
        elemInfo.propertyStart = propName.getStart(sourceFile);
        elemInfo.propertyEnd = propName.getEnd();
        elemInfo.propertyOffset = elemInfo.propertyStart - originalTagStart;
      }

      allJsxElements.push(elemInfo);
      return transformed;
    }
  }

  // Top-level replacements (for text substitution)
  const replacements: Array<{ start: number; end: number; newText: string }> = [];

  function visit(node: ts.Node) {
    if (typescript.isJsxElement(node) || typescript.isJsxSelfClosingElement(node)) {
      replacements.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        newText: transformJsxNode(node, 0),
      });
      return;
    }
    if (typescript.isJsxFragment(node)) {
      // Fragment: track children offsets starting after "jsx(Fragment, null"
      const prefixLen = 4 + "Fragment".length + 2 + "null".length; // "jsx(Fragment, null"
      const children = extractChildrenWithOffsets(
        node.children,
        sourceFile,
        typescript,
        prefixLen,
        allJsxElements,
        transformJsxNode,
      );
      const transformed =
        children.values.length > 0
          ? `jsx(Fragment, null, ${children.values.join(", ")})`
          : `jsx(Fragment, null)`;
      replacements.push({
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        newText: transformed,
      });
      return;
    }
    typescript.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Sort replacements by start position (ascending) for mapping
  replacements.sort((a, b) => a.start - b.start);

  // Calculate where each top-level replacement ends up in the final text
  const topLevelPositions = new Map<number, { transformedStart: number; newText: string }>();
  let cumulativeOffset = 0;
  for (const r of replacements) {
    const originalLen = r.end - r.start;
    const newLen = r.newText.length;
    topLevelPositions.set(r.start, {
      transformedStart: r.start + cumulativeOffset,
      newText: r.newText,
    });
    cumulativeOffset += newLen - originalLen;
  }

  // Build mapping for ALL JSX elements (including nested)
  const mapping: PositionMapping = {
    replacements: [],
  };

  for (const elem of allJsxElements) {
    // Find the top-level replacement that contains this element
    let containingReplacement: { transformedStart: number; newText: string } | null = null;
    let containingStart = 0;

    for (const r of replacements) {
      if (r.start <= elem.originalStart && r.end >= elem.originalEnd) {
        containingReplacement = topLevelPositions.get(r.start)!;
        containingStart = r.start;
        break;
      }
    }

    if (!containingReplacement) continue;

    const isTopLevel = elem.originalStart === containingStart;
    // Tag name is at "jsx(" (4 chars) after the element's start offset
    const transformedTagStart = containingReplacement.transformedStart + elem.offsetInTopLevel + 4;

    const replacement: PositionMapping["replacements"][number] = {
      originalStart: elem.originalStart,
      originalEnd: elem.originalEnd,
      originalTagStart: elem.originalTagStart,
      originalTagEnd: elem.originalTagEnd,
      transformedTagStart,
      isTopLevel,
      ...(isTopLevel
        ? {
            transformedFullStart: containingReplacement.transformedStart,
            transformedFullEnd:
              containingReplacement.transformedStart + containingReplacement.newText.length,
          }
        : {}),
    };

    if (
      elem.propertyStart !== undefined &&
      elem.propertyEnd !== undefined &&
      elem.propertyOffset !== undefined
    ) {
      replacement.originalPropertyStart = elem.propertyStart;
      replacement.originalPropertyEnd = elem.propertyEnd;
      replacement.transformedPropertyStart = transformedTagStart + elem.propertyOffset;
    }

    if (elem.childExpressions && elem.childExpressions.length > 0) {
      replacement.childExpressions = elem.childExpressions.map((ce) => ({
        originalStart: ce.originalStart,
        originalEnd: ce.originalEnd,
        transformedStart: containingReplacement!.transformedStart + ce.offsetInTopLevel,
      }));
    }

    mapping.replacements.push(replacement);
  }

  // Sort mapping replacements by original position
  mapping.replacements.sort((a, b) => a.originalStart - b.originalStart);

  // Apply replacements in reverse order to preserve positions during string manipulation
  const reversedReplacements = [...replacements].sort((a, b) => b.start - a.start);
  for (const { start, end, newText } of reversedReplacements) {
    result = result.slice(0, start) + newText + result.slice(end);
  }

  return { text: result, mapping };
}

/**
 * Check if a source file already imports 'jsx' from somewhere
 *
 */
function hasJsxImport(sourceFile: ts.SourceFile, typescript: typeof ts): boolean {
  return getJsxImportSource(sourceFile, typescript) !== null;
}

/**
 * Find where jsx is imported from
 * Returns the module specifier string, or null if not found
 *
 */
function getJsxImportSource(sourceFile: ts.SourceFile, typescript: typeof ts): string | null {
  for (const statement of sourceFile.statements) {
    if (typescript.isImportDeclaration(statement) && statement.importClause) {
      const namedBindings = statement.importClause.namedBindings;
      if (namedBindings && typescript.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          if (element.name.text === "jsx") {
            // Found jsx import - return the module specifier
            const moduleSpecifier = statement.moduleSpecifier;
            if (typescript.isStringLiteral(moduleSpecifier)) {
              return moduleSpecifier.text;
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * Derive the base module from a jsx import path
 * "foo/jsx-runtime" -> "foo"
 * "foo/jsx-dev-runtime" -> "foo"
 * "foo" -> "foo"
 *
 */
function deriveBaseModule(jsxImportPath: string): string {
  if (jsxImportPath.endsWith("/jsx-runtime")) {
    return jsxImportPath.slice(0, -"/jsx-runtime".length);
  }
  if (jsxImportPath.endsWith("/jsx-dev-runtime")) {
    return jsxImportPath.slice(0, -"/jsx-dev-runtime".length);
  }
  return jsxImportPath;
}

/**
 * Collect all JSX tag names used in a source file
 *
 */
function collectJsxTagNames(sourceFile: ts.SourceFile, typescript: typeof ts): Set<string> {
  const tagNames = new Set<string>();

  function visit(node: ts.Node) {
    if (typescript.isJsxElement(node)) {
      const tagNameNode = node.openingElement.tagName;
      if (typescript.isIdentifier(tagNameNode)) {
        tagNames.add(tagNameNode.text);
      }
    } else if (typescript.isJsxSelfClosingElement(node)) {
      const tagNameNode = node.tagName;
      if (typescript.isIdentifier(tagNameNode)) {
        tagNames.add(tagNameNode.text);
      }
    } else if (typescript.isJsxFragment(node)) {
      // Fragments need Fragment to be imported
      tagNames.add("Fragment");
    }
    typescript.forEachChild(node, visit);
  }

  visit(sourceFile);
  return tagNames;
}

/**
 * Get all identifiers that are already in scope (imported or locally declared)
 *
 */
function getIdentifiersInScope(sourceFile: ts.SourceFile, typescript: typeof ts): Set<string> {
  const identifiers = new Set<string>();

  for (const statement of sourceFile.statements) {
    // Check imports
    if (typescript.isImportDeclaration(statement) && statement.importClause) {
      // Default import
      if (statement.importClause.name) {
        identifiers.add(statement.importClause.name.text);
      }
      // Named imports
      const namedBindings = statement.importClause.namedBindings;
      if (namedBindings) {
        if (typescript.isNamedImports(namedBindings)) {
          for (const element of namedBindings.elements) {
            identifiers.add(element.name.text);
          }
        } else if (typescript.isNamespaceImport(namedBindings)) {
          // import * as foo
          identifiers.add(namedBindings.name.text);
        }
      }
    }
    // Check variable declarations (const, let, var)
    else if (typescript.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (typescript.isIdentifier(decl.name)) {
          identifiers.add(decl.name.text);
        }
      }
    }
    // Check function declarations
    else if (typescript.isFunctionDeclaration(statement) && statement.name) {
      identifiers.add(statement.name.text);
    }
    // Check class declarations
    else if (typescript.isClassDeclaration(statement) && statement.name) {
      identifiers.add(statement.name.text);
    }
    // Check type aliases (for const/type shadowing pattern)
    else if (typescript.isTypeAliasDeclaration(statement)) {
      identifiers.add(statement.name.text);
    }
  }

  return identifiers;
}

/**
 * Resolve the named exports of a module using the program's type checker.
 * Returns undefined if the module can't be resolved.
 */
function resolveModuleExports(
  moduleName: string,
  sourceFile: ts.SourceFile,
  program: ts.Program,
  typescript: typeof ts,
): Set<string> | undefined {
  try {
    const checker = program.getTypeChecker();
    const resolved = typescript.resolveModuleName(
      moduleName,
      sourceFile.fileName,
      program.getCompilerOptions(),
      typescript.sys,
    );
    const resolvedFileName = resolved.resolvedModule?.resolvedFileName;
    if (!resolvedFileName) return undefined;

    const moduleSourceFile = program.getSourceFile(resolvedFileName);
    if (!moduleSourceFile) return undefined;

    const symbol = checker.getSymbolAtLocation(moduleSourceFile);
    if (!symbol) return undefined;

    const exports = checker.getExportsOfModule(symbol);
    return new Set(exports.map((e) => e.name));
  } catch {
    return undefined;
  }
}

/**
 * Inject imports for unknown JSX tags based on the jsx import source
 *
 */
function injectTagImports(
  text: string,
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
  baseModule: string,
  moduleExports?: Set<string>,
): string {
  return injectTagImportsWithOffset(text, sourceFile, typescript, baseModule, 0, moduleExports)
    .text;
}

/**
 * Inject imports for unknown JSX tags, returning both text and bytes added
 *
 * @param insertOffset - offset to add to insert position (for chained injections)
 */
function injectTagImportsWithOffset(
  text: string,
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
  baseModule: string,
  insertOffset: number = 0,
  moduleExports?: Set<string>,
): { text: string; bytesAdded: number } {
  const tagNames = collectJsxTagNames(sourceFile, typescript);
  const inScope = getIdentifiersInScope(sourceFile, typescript);

  // Find tags that are used but not in scope, and actually exported by the module
  const unknownTags = [...tagNames].filter(
    (tag) => !inScope.has(tag) && (!moduleExports || moduleExports.has(tag)),
  );

  if (unknownTags.length === 0) {
    return { text, bytesAdded: 0 };
  }

  // Generate import statement
  const importStatement = `import { ${unknownTags.sort().join(", ")} } from "${baseModule}";\n`;
  const insertPos = findImportInsertPosition(sourceFile, typescript) + insertOffset;

  if (insertPos === 0) {
    return { text: importStatement + text, bytesAdded: importStatement.length };
  } else {
    // +1 for the newline before the import
    return {
      text: text.slice(0, insertPos) + "\n" + importStatement + text.slice(insertPos),
      bytesAdded: 1 + importStatement.length,
    };
  }
}

/**
 * Find the position after all imports (to insert new imports)
 *
 */
export function findImportInsertPosition(sourceFile: ts.SourceFile, typescript: typeof ts): number {
  let lastImportEnd = 0;
  for (const statement of sourceFile.statements) {
    if (typescript.isImportDeclaration(statement)) {
      lastImportEnd = statement.getEnd();
    } else {
      // Stop at first non-import statement
      break;
    }
  }
  return lastImportEnd;
}

/**
 * Inject jsx import into transformed text if needed
 *
 */
function injectJsxImport(
  text: string,
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
  jsxImportSource: string,
): string {
  return injectJsxImportWithOffset(text, sourceFile, typescript, jsxImportSource).text;
}

/**
 * Inject jsx import, returning both text and bytes added
 *
 * @param insertOffset - offset to add to insert position (for chained injections)
 */
function injectJsxImportWithOffset(
  text: string,
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
  jsxImportSource: string,
  insertOffset: number = 0,
): { text: string; bytesAdded: number } {
  if (hasJsxImport(sourceFile, typescript)) {
    return { text, bytesAdded: 0 };
  }

  const importStatement = `import { jsx } from "${jsxImportSource}/jsx-runtime";\n`;
  const insertPos = findImportInsertPosition(sourceFile, typescript) + insertOffset;

  if (insertPos === 0) {
    return { text: importStatement + text, bytesAdded: importStatement.length };
  } else {
    return {
      text: text.slice(0, insertPos) + "\n" + importStatement + text.slice(insertPos),
      bytesAdded: 1 + importStatement.length,
    };
  }
}

/**
 * Transform JSX to direct function calls.
 * If jsxImportSource is provided and no jsx import exists, auto-imports jsx.
 * Also auto-imports unknown JSX tags from the base module.
 *
 * <Field name="id">{123}</Field>
 * becomes:
 * jsx(Field, { name: "id" }, 123)
 *
 *
 */
export function transformSourceFile(
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
  jsxImportSource?: string,
  program?: ts.Program,
  moduleExportsCache?: Map<string, Set<string> | undefined>,
): string {
  let result = transformWithMapping(sourceFile, typescript).text;

  // Determine the base module for auto-imports:
  // 1. Explicit jsx import is the source of truth
  // 2. Fall back to jsxImportSource from tsconfig
  const explicitJsxImport = getJsxImportSource(sourceFile, typescript);
  let baseModule: string | null = null;

  if (explicitJsxImport) {
    baseModule = deriveBaseModule(explicitJsxImport);
  } else if (jsxImportSource) {
    baseModule = jsxImportSource;
    // Also inject the jsx import since there's no explicit one
    result = injectJsxImport(result, sourceFile, typescript, jsxImportSource);
  }

  // Auto-import unknown JSX tags from the base module
  // Only import tags that the module actually exports
  if (baseModule) {
    let moduleExports: Set<string> | undefined;
    if (program) {
      if (moduleExportsCache?.has(baseModule)) {
        moduleExports = moduleExportsCache.get(baseModule);
      } else {
        moduleExports = resolveModuleExports(baseModule, sourceFile, program, typescript);
        moduleExportsCache?.set(baseModule, moduleExports);
      }
    }
    result = injectTagImports(result, sourceFile, typescript, baseModule, moduleExports);
  }

  return result;
}

function extractProps(
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
): string {
  const props: string[] = [];

  for (const attr of attributes.properties) {
    if (typescript.isJsxAttribute(attr) && attr.name) {
      const name = attr.name.getText(sourceFile);
      let value = "true"; // default for boolean attributes

      if (attr.initializer) {
        if (typescript.isStringLiteral(attr.initializer)) {
          value = JSON.stringify(attr.initializer.text);
        } else if (typescript.isJsxExpression(attr.initializer) && attr.initializer.expression) {
          value = attr.initializer.expression.getText(sourceFile);
        }
      }

      props.push(`${name}: ${value}`);
    } else if (typescript.isJsxSpreadAttribute(attr)) {
      // Handle spread: {...props}
      props.push(`...${attr.expression.getText(sourceFile)}`);
    }
  }

  return props.join(", ");
}

/**
 * Like extractChildren, but also computes exact offsets for child expressions
 * and nested JSX elements within the top-level replacement text.
 *
 * @param childrenStartOffset - the character offset (within the top-level replacement)
 *   where children begin, i.e. right after "jsx(TagName, props"
 */
function extractChildrenWithOffsets(
  children: ts.NodeArray<ts.JsxChild>,
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
  childrenStartOffset: number,
  allJsxElements: Array<{
    originalStart: number;
    originalEnd: number;
    originalTagStart: number;
    originalTagEnd: number;
    tagName: string;
    offsetInTopLevel: number;
    propertyStart?: number;
    propertyEnd?: number;
    propertyOffset?: number;
    childExpressions?: Array<{
      originalStart: number;
      originalEnd: number;
      offsetInTopLevel: number;
    }>;
  }>,
  transformJsxNode: (node: ts.JsxElement | ts.JsxSelfClosingElement, baseOffset: number) => string,
): {
  values: string[];
  childExpressions: Array<{
    originalStart: number;
    originalEnd: number;
    offsetInTopLevel: number;
  }>;
} {
  const values: string[] = [];
  const childExpressions: Array<{
    originalStart: number;
    originalEnd: number;
    offsetInTopLevel: number;
  }> = [];

  // Running offset: each child is preceded by ", " (2 chars)
  let offset = childrenStartOffset;

  for (const child of children) {
    if (typescript.isJsxExpression(child) && child.expression) {
      const isSpread = !!child.dotDotDotToken;
      const exprText = child.expression.getText(sourceFile);
      const value = isSpread ? `...${exprText}` : exprText;
      const childOffset = offset + 2; // ", " separator
      if (!isSpread) {
        childExpressions.push({
          originalStart: child.expression.getStart(sourceFile),
          originalEnd: child.expression.getEnd(),
          offsetInTopLevel: childOffset,
        });
      }
      values.push(value);
      offset = childOffset + value.length;
    } else if (typescript.isJsxText(child)) {
      const text = child.text.trim();
      if (text) {
        const str = JSON.stringify(text);
        offset += 2 + str.length; // ", " + value
        values.push(str);
      }
    } else if (typescript.isJsxElement(child) || typescript.isJsxSelfClosingElement(child)) {
      const childOffset = offset + 2; // ", " separator
      const transformed = transformJsxNode(child, childOffset);
      values.push(transformed);
      offset = childOffset + transformed.length;
    } else if (typescript.isJsxFragment(child)) {
      const childOffset = offset + 2; // ", " separator
      // "jsx(Fragment, null" prefix inside the fragment
      const fragPrefixLen = 4 + "Fragment".length + 2 + "null".length;
      const fragChildren = extractChildrenWithOffsets(
        child.children,
        sourceFile,
        typescript,
        childOffset + fragPrefixLen,
        allJsxElements,
        transformJsxNode,
      );
      const transformed =
        fragChildren.values.length > 0
          ? `jsx(Fragment, null, ${fragChildren.values.join(", ")})`
          : `jsx(Fragment, null)`;
      values.push(transformed);
      offset = childOffset + transformed.length;
    }
  }

  return { values, childExpressions };
}

// =============================================================================
// Language Service Plugin
// =============================================================================

/**
 * Find the innermost JSX element whose tag name contains a position.
 * For member expressions like Foo.bar, if hovering on "bar", returns info for "bar" specifically.
 */
function findContainingTagName(
  pos: number,
  mapping: PositionMapping,
): {
  originalTagStart: number;
  originalTagEnd: number;
  transformedStart: number;
} | null {
  let innermost: {
    originalTagStart: number;
    originalTagEnd: number;
    transformedStart: number;
    size: number;
  } | null = null;

  for (const r of mapping.replacements) {
    if (
      r.originalPropertyStart !== undefined &&
      r.originalPropertyEnd !== undefined &&
      r.transformedPropertyStart !== undefined &&
      pos >= r.originalPropertyStart &&
      pos < r.originalPropertyEnd
    ) {
      const size = r.originalEnd - r.originalStart;
      if (!innermost || size < innermost.size) {
        innermost = {
          originalTagStart: r.originalPropertyStart,
          originalTagEnd: r.originalPropertyEnd,
          transformedStart: r.transformedPropertyStart,
          size,
        };
      }
    } else if (pos >= r.originalTagStart && pos < r.originalTagEnd) {
      const size = r.originalEnd - r.originalStart;
      if (!innermost || size < innermost.size) {
        innermost = {
          originalTagStart: r.originalTagStart,
          originalTagEnd: r.originalTagEnd,
          transformedStart: r.transformedTagStart,
          size,
        };
      }
    }
  }

  return innermost;
}

function isInsideJsxElement(pos: number, mapping: PositionMapping): boolean {
  for (const r of mapping.replacements) {
    if (pos >= r.originalStart && pos < r.originalEnd) {
      return true;
    }
  }
  return false;
}

function isInsideChildExpression(pos: number, mapping: PositionMapping): boolean {
  for (const r of mapping.replacements) {
    if (r.childExpressions) {
      for (const ce of r.childExpressions) {
        if (pos >= ce.originalStart && pos < ce.originalEnd) {
          return true;
        }
      }
    }
  }
  return false;
}

function createVirtualLanguageServiceHost(
  typescript: typeof ts,
  originalHost: ts.LanguageServiceHost,
  transformedFiles: Map<string, string>,
): ts.LanguageServiceHost {
  return {
    getCompilationSettings: () => originalHost.getCompilationSettings(),
    getScriptFileNames: () => originalHost.getScriptFileNames(),
    getScriptVersion: (fileName) => {
      const original = originalHost.getScriptVersion(fileName);
      return transformedFiles.has(fileName) ? `${original}-transformed` : original;
    },
    getScriptSnapshot: (fileName) => {
      if (transformedFiles.has(fileName)) {
        return typescript.ScriptSnapshot.fromString(transformedFiles.get(fileName)!);
      }
      return originalHost.getScriptSnapshot(fileName);
    },
    getCurrentDirectory: () => originalHost.getCurrentDirectory(),
    getDefaultLibFileName: (options) => typescript.getDefaultLibFilePath(options),
    fileExists: (fileName) =>
      transformedFiles.has(fileName) ||
      (originalHost.fileExists ? originalHost.fileExists(fileName) : false),
    readFile: (fileName) => {
      if (transformedFiles.has(fileName)) {
        return transformedFiles.get(fileName);
      }
      return originalHost.readFile ? originalHost.readFile(fileName) : undefined;
    },
    directoryExists: originalHost.directoryExists?.bind(originalHost),
    getDirectories: originalHost.getDirectories?.bind(originalHost),
    readDirectory: originalHost.readDirectory?.bind(originalHost),
    realpath: originalHost.realpath?.bind(originalHost),
  };
}

function initLanguageService(modules: { typescript: typeof ts }): {
  create: (info: ts.server.PluginCreateInfo) => ts.LanguageService;
} {
  const typescript = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const log = (msg: string) => {
      info.project.projectService.logger.info(`[strict-jsx] ${msg}`);
    };

    log("Plugin initialized");

    const transformCache = new Map<
      string,
      { version: string; transformed: string; mapping: PositionMapping }
    >();

    let virtualLS: ts.LanguageService | null = null;
    let virtualLSCreatedAtVersion = -1;
    const moduleExportsCache = new Map<string, Set<string> | undefined>();

    function getModuleExports(
      baseModule: string,
      sourceFile: ts.SourceFile,
    ): Set<string> | undefined {
      if (moduleExportsCache.has(baseModule)) {
        return moduleExportsCache.get(baseModule);
      }
      const program = info.languageService.getProgram();
      if (!program) return undefined;
      const exports = resolveModuleExports(baseModule, sourceFile, program, typescript);
      moduleExportsCache.set(baseModule, exports);
      return exports;
    }

    function getTransformedInfo(fileName: string) {
      const version = info.languageServiceHost.getScriptVersion(fileName);
      const cached = transformCache.get(fileName);

      if (cached && cached.version === version) {
        return cached;
      }

      const snapshot = info.languageServiceHost.getScriptSnapshot(fileName);
      if (!snapshot) return null;

      const originalText = snapshot.getText(0, snapshot.getLength());
      const sourceFile = typescript.createSourceFile(
        fileName,
        originalText,
        typescript.ScriptTarget.Latest,
        true,
        typescript.ScriptKind.TSX,
      );

      let { text: transformedText, mapping } = transformWithMapping(sourceFile, typescript);

      let importBytesAdded = 0;

      const explicitJsxImport = getJsxImportSource(sourceFile, typescript);
      const compilerOptions = info.languageServiceHost.getCompilationSettings();
      const jsxImportSource = compilerOptions.jsxImportSource as string | undefined;
      let baseModule: string | null = null;

      if (explicitJsxImport) {
        baseModule = deriveBaseModule(explicitJsxImport);
      } else if (jsxImportSource) {
        baseModule = jsxImportSource;
        const jsxResult = injectJsxImportWithOffset(
          transformedText,
          sourceFile,
          typescript,
          jsxImportSource,
        );
        transformedText = jsxResult.text;
        importBytesAdded += jsxResult.bytesAdded;
      }

      if (baseModule) {
        const tagResult = injectTagImportsWithOffset(
          transformedText,
          sourceFile,
          typescript,
          baseModule,
          importBytesAdded,
          getModuleExports(baseModule, sourceFile),
        );
        transformedText = tagResult.text;
        importBytesAdded += tagResult.bytesAdded;
      }

      if (importBytesAdded > 0) {
        mapping = {
          ...mapping,
          importOffset: importBytesAdded,
          importInsertPos: findImportInsertPosition(sourceFile, typescript),
        };
      }

      if (transformedText === originalText) {
        return null;
      }

      const result = { version, transformed: transformedText, mapping };
      transformCache.set(fileName, result);

      return result;
    }

    function computeProjectVersionHash(): number {
      let combined = "";
      for (const fileName of info.languageServiceHost.getScriptFileNames()) {
        if (fileName.endsWith(".tsx")) {
          combined += `${fileName}:${info.languageServiceHost.getScriptVersion(fileName)};`;
        }
      }
      let hash = 0;
      for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) - hash + combined.charCodeAt(i)) | 0;
      }
      return hash;
    }

    function getVirtualLanguageService(): ts.LanguageService {
      const versionHash = computeProjectVersionHash();

      if (virtualLS && virtualLSCreatedAtVersion === versionHash) {
        return virtualLS;
      }

      // Version changed — rebuild transformed files and recreate virtual LS
      const transformedFiles = new Map<string, string>();
      const currentFiles = new Set<string>();

      for (const fileName of info.languageServiceHost.getScriptFileNames()) {
        if (fileName.endsWith(".tsx")) {
          currentFiles.add(fileName);
          const transformed = getTransformedInfo(fileName);
          if (transformed) {
            transformedFiles.set(fileName, transformed.transformed);
          }
        }
      }

      // Evict cache entries for files no longer in the project
      for (const cachedFile of transformCache.keys()) {
        if (!currentFiles.has(cachedFile)) {
          transformCache.delete(cachedFile);
        }
      }

      const virtualHost = createVirtualLanguageServiceHost(
        typescript,
        info.languageServiceHost,
        transformedFiles,
      );
      virtualLS = typescript.createLanguageService(virtualHost);
      virtualLSCreatedAtVersion = versionHash;
      moduleExportsCache.clear();

      return virtualLS;
    }

    const proxy: ts.LanguageService = Object.create(null);

    for (const k of Object.keys(info.languageService) as Array<keyof ts.LanguageService>) {
      const original = info.languageService[k];
      if (typeof original === "function") {
        // @ts-expect-error - dynamic proxy
        proxy[k] = (...args: unknown[]) =>
          // @ts-expect-error - dynamic proxy
          original.apply(info.languageService, args);
      }
    }

    proxy.getQuickInfoAtPosition = (
      fileName: string,
      position: number,
    ): ts.QuickInfo | undefined => {
      if (!fileName.endsWith(".tsx")) {
        return info.languageService.getQuickInfoAtPosition(fileName, position);
      }

      const transformedInfo = getTransformedInfo(fileName);
      if (!transformedInfo) {
        return info.languageService.getQuickInfoAtPosition(fileName, position);
      }

      const tagName = findContainingTagName(position, transformedInfo.mapping);
      const insideJsx = isInsideJsxElement(position, transformedInfo.mapping);
      const insideChildExpr = isInsideChildExpression(position, transformedInfo.mapping);

      if (insideJsx && !tagName && !insideChildExpr) {
        return info.languageService.getQuickInfoAtPosition(fileName, position);
      }

      const importOffset = transformedInfo.mapping.importOffset ?? 0;
      const transformedPosition = tagName
        ? tagName.transformedStart + importOffset
        : mapOriginalToTransformed(position, transformedInfo.mapping);
      try {
        const vls = getVirtualLanguageService();
        const quickInfo = vls.getQuickInfoAtPosition(fileName, transformedPosition);

        if (quickInfo) {
          if (tagName) {
            return {
              ...quickInfo,
              textSpan: {
                start: tagName.originalTagStart,
                length: tagName.originalTagEnd - tagName.originalTagStart,
              },
            };
          } else {
            return {
              ...quickInfo,
              textSpan: {
                start: position,
                length: quickInfo.textSpan.length,
              },
            };
          }
        }
      } catch (e) {
        log(`Error querying virtual LS: ${e}`);
      }

      return info.languageService.getQuickInfoAtPosition(fileName, position);
    };

    function remapDiagnostics<T extends ts.Diagnostic>(
      fileName: string,
      fallback: () => T[],
      virtual: (vls: ts.LanguageService) => T[],
    ): T[] {
      if (!fileName.endsWith(".tsx")) return fallback();
      const transformedInfo = getTransformedInfo(fileName);
      if (!transformedInfo) return fallback();
      try {
        return virtual(getVirtualLanguageService()).map((diag): T => {
          if (diag.start !== undefined && diag.length !== undefined) {
            const originalStart = mapTransformedToOriginal(diag.start, transformedInfo.mapping);
            const originalEnd = mapTransformedToOriginal(
              diag.start + diag.length,
              transformedInfo.mapping,
            );
            return {
              ...diag,
              start: originalStart,
              length: Math.max(1, originalEnd - originalStart),
            };
          }
          return diag;
        });
      } catch (e) {
        log(`Error getting diagnostics from virtual LS: ${e}`);
        return fallback();
      }
    }

    proxy.getSemanticDiagnostics = (fileName) =>
      remapDiagnostics(
        fileName,
        () => info.languageService.getSemanticDiagnostics(fileName),
        (vls) => vls.getSemanticDiagnostics(fileName),
      );

    proxy.getSyntacticDiagnostics = (fileName) =>
      remapDiagnostics(
        fileName,
        () => info.languageService.getSyntacticDiagnostics(fileName),
        (vls) => vls.getSyntacticDiagnostics(fileName),
      );

    proxy.getSuggestionDiagnostics = (fileName) =>
      remapDiagnostics(
        fileName,
        () => info.languageService.getSuggestionDiagnostics(fileName),
        (vls) => vls.getSuggestionDiagnostics(fileName),
      );

    return proxy;
  }

  return { create };
}

// =============================================================================
// Entry Point
// =============================================================================

/**
 * Unified entry point that works as both:
 * 1. TypeScript Language Service Plugin (when called with { typescript })
 * 2. ts-patch Program Transformer (when called with program, host, config, extras)
 *
 * This allows a single plugin config:
 * {
 *   "name": "strict-jsx",
 *   "transform": "strict-jsx",
 *   "transformProgram": true
 * }
 */
function init(
  arg: ts.Program | { typescript: typeof ts },
  host?: ts.CompilerHost,
  pluginConfig?: Record<string, unknown>,
  extras?: ProgramTransformerExtras,
): ts.Program | { create: (info: ts.server.PluginCreateInfo) => ts.LanguageService } {
  // Check if this is a Language Service plugin call
  // LS plugins are called with { typescript: typeof ts }
  if (
    arg &&
    typeof arg === "object" &&
    "typescript" in arg &&
    typeof (arg as { typescript: unknown }).typescript === "object" &&
    (arg as { typescript: { createProgram?: unknown } }).typescript?.createProgram
  ) {
    return initLanguageService(arg as { typescript: typeof ts });
  }

  // Otherwise it's a ts-patch transformer call
  return transform(arg as ts.Program, host, pluginConfig!, extras!);
}

export default init;
