/**
 * Test script to verify the strict-jsx language service plugin works correctly.
 * Run with: node test-ls-plugin.js
 */

const ts = require("typescript");
const path = require("path");
const fs = require("fs");

// Load the plugin
const initPlugin = require("strict-jsx/language-service");

// Initialize it with TypeScript
const plugin = initPlugin({ typescript: ts });

console.log("Plugin loaded successfully");
console.log("Plugin has create:", typeof plugin.create === "function");

// Create a minimal language service host
const fileName = path.join(__dirname, "src/example.tsx");
const fileContent = fs.readFileSync(fileName, "utf-8");

const host = {
  getCompilationSettings: () => ({
    jsx: ts.JsxEmit.ReactJSX,
    jsxImportSource: "./src",
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
  }),
  getScriptFileNames: () => [fileName],
  getScriptVersion: () => "1",
  getScriptSnapshot: (fn) => {
    if (fn === fileName) {
      return ts.ScriptSnapshot.fromString(fileContent);
    }
    if (fs.existsSync(fn)) {
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fn, "utf-8"));
    }
    return undefined;
  },
  getCurrentDirectory: () => __dirname,
  getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
  fileExists: (fn) => fs.existsSync(fn),
  readFile: (fn) => fs.existsSync(fn) ? fs.readFileSync(fn, "utf-8") : undefined,
};

// Create the base language service
const baseLS = ts.createLanguageService(host);

// Create a mock PluginCreateInfo
const mockInfo = {
  languageService: baseLS,
  languageServiceHost: host,
  project: {
    getProjectName: () => "test-project",
    projectService: {
      logger: {
        info: (msg) => console.log("[TS Logger]", msg),
      },
    },
  },
  config: {
    jsxImportSource: "./jsx-runtime.js",
  },
};

// Create the wrapped language service
console.log("\n--- Creating plugin-wrapped language service ---\n");
const wrappedLS = plugin.create(mockInfo);

// Find a JSX position in the file - look for actual JSX (const xxx = <)
const jsxMatch = fileContent.match(/const addOne = <NaturalNumber\.add>/);
if (jsxMatch) {
  const position = jsxMatch.index + "const addOne = ".length + 5; // Position inside the JSX tag name
  console.log(`\n--- Testing getQuickInfoAtPosition at position ${position} ---\n`);
  console.log(`Context: "${fileContent.slice(Math.max(0, position - 20), position + 30)}"`);

  const quickInfo = wrappedLS.getQuickInfoAtPosition(fileName, position);

  if (quickInfo) {
    console.log("\nQuick Info Result:");
    console.log("  Kind:", quickInfo.kind);
    console.log("  Display Parts:", quickInfo.displayParts?.map(p => p.text).join(""));
    console.log("  Documentation:", quickInfo.documentation?.map(p => p.text).join(""));
  } else {
    console.log("No quick info returned");
  }
} else {
  console.log("Could not find JSX in file");
}

// Test colorizer methods
console.log("\n--- Testing Colorizer Methods ---\n");

// Simulate ts-patch transformation by creating a "transformed" base LS
const { transformSourceFile } = require("strict-jsx");

const transformedContent = transformSourceFile(
  ts.createSourceFile(fileName, fileContent, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  ts,
  "./jsx-runtime.js"
);

console.log("Transformed content (first 300 chars):");
console.log(transformedContent.slice(0, 300));
console.log("...\n");

// Create a host that returns TRANSFORMED content (simulating ts-patch)
// But note: the actual file on disk is still the ORIGINAL content
// This is how VS Code works - file on disk is original, but LS might see transformed
const transformedHost = {
  ...host,
  getScriptSnapshot: (fn) => {
    if (fn === fileName) {
      // Return TRANSFORMED content (what ts-patch would do)
      return ts.ScriptSnapshot.fromString(transformedContent);
    }
    if (fs.existsSync(fn)) {
      return ts.ScriptSnapshot.fromString(fs.readFileSync(fn, "utf-8"));
    }
    return undefined;
  },
  readFile: (fn) => {
    if (fn === fileName) {
      return transformedContent;
    }
    return fs.existsSync(fn) ? fs.readFileSync(fn, "utf-8") : undefined;
  },
  // Note: fileExists should return true for the real file path
  fileExists: (fn) => fs.existsSync(fn),
};

// Create LS with transformed content (simulating what tsserver sees with ts-patch)
const transformedBaseLS = ts.createLanguageService(transformedHost);

// Create mock info with transformed LS
const mockInfoTransformed = {
  languageService: transformedBaseLS,
  languageServiceHost: transformedHost,
  project: {
    getProjectName: () => "test-project-transformed",
    projectService: {
      logger: {
        info: (msg) => {}, // quiet
      },
    },
  },
  config: {
    jsxImportSource: "./jsx-runtime.js",
  },
};

// Create wrapped LS on top of transformed LS
console.log("Creating wrapped LS on top of TRANSFORMED base LS...\n");
const wrappedTransformedLS = plugin.create(mockInfoTransformed);

// Find a JSX line to test colorization
const jsxLineMatch = fileContent.match(/const addOne = <NaturalNumber\.add>/);
if (jsxLineMatch) {
  const lineStart = jsxLineMatch.index;
  const lineEnd = fileContent.indexOf("\n", lineStart);
  const span = { start: lineStart, length: lineEnd - lineStart };

  console.log(`Original file span: ${lineStart}-${lineEnd}`);
  console.log(`Original line: "${fileContent.slice(lineStart, lineEnd)}"`);
  console.log(`Transformed at same positions: "${transformedContent.slice(lineStart, lineEnd)}"`);

  // Test what the TRANSFORMED base LS returns (this is what VS Code would see without our fix)
  console.log("\n1. Transformed base LS classifications (BROKEN - wrong positions):");
  const transformedSyntactic = transformedBaseLS.getSyntacticClassifications(fileName, span);
  for (const c of transformedSyntactic) {
    const origText = fileContent.slice(c.textSpan.start, c.textSpan.start + c.textSpan.length);
    const transText = transformedContent.slice(c.textSpan.start, c.textSpan.start + c.textSpan.length);
    console.log(`   [${c.textSpan.start}-${c.textSpan.start + c.textSpan.length}] orig:"${origText}" trans:"${transText}" -> ${c.classificationType}`);
  }

  // Test what our wrapped LS returns (should use original source)
  console.log("\n2. Wrapped LS classifications (should be FIXED - correct positions):");
  const wrappedSyntactic = wrappedTransformedLS.getSyntacticClassifications(fileName, span);
  for (const c of wrappedSyntactic) {
    const origText = fileContent.slice(c.textSpan.start, c.textSpan.start + c.textSpan.length);
    console.log(`   [${c.textSpan.start}-${c.textSpan.start + c.textSpan.length}] "${origText}" -> ${c.classificationType}`);
  }

  // Test original (non-transformed) LS for reference
  console.log("\n3. Original base LS classifications (reference):");
  const baseSyntactic = baseLS.getSyntacticClassifications(fileName, span);
  for (const c of baseSyntactic) {
    const origText = fileContent.slice(c.textSpan.start, c.textSpan.start + c.textSpan.length);
    console.log(`   [${c.textSpan.start}-${c.textSpan.start + c.textSpan.length}] "${origText}" -> ${c.classificationType}`);
  }
}

console.log("\n--- Test complete ---");
