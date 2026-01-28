# strict-jsx

We want strict, narrowly typed JSX for custom applications.

## 1. Installation

```bash
npm install strict-jsx ts-patch --save-dev
npx ts-patch install
```

Because we're patching the compiler, you'll need to now use `tspc` in lieu of
`tsc` (via [ts-patch](https://www.npmjs.com/package/ts-patch))

## 2. Configuration

You need to install `strict-jsx` as a TypeScript plugin:

### 2.1. Compiler Options

```json
{
  "compilerOptions": {
    "jsxImportSource": "your-jsx-library", // optional
    "plugins": [
      {
        "name": "strict-jsx",
        "transform": "strict-jsx",
        "transformProgram": true
      }
    ]
  }
}
```

If you don't provide `jsxImportSource`, you must import (or define) `jsx`
manually - this is needed when multiple JSX contexts exist in one codebase.

The other exports of the path or module where `jsx` is from will define the set
of 'ambient' or auto-imported symbols that the transformer autofills when these
symbols are referenced as a tag.

### 2.2. VS Code Settings

1. Run "TypeScript: Select TypeScript Version..." in the Command Palette
2. Select "Use Workspace Version"

Alternatively, set the following key in your `.vscode/settings.json` file:

```json
{
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

## 3. Usage

As an arbitrary example, you could use JSX to specify a route tree:

```tsx
const app = (
  <App port={3000}>
    <Route path="/api">
      <Get>
        <Handler>{listTodos}</Handler>
      </Get>
      <Post>
        <Request>{TodoSchema}</Request>
        <Handler>{createTodo}</Handler>
      </Post>
    </Route>
  </App>
);
```

The sky really is the limit; this is actually a tool for building "languages".
Combined with conditional types, a lot of powerful metaprogramming arises.

## 4. Misc

### 4.1. Language Service Plugin

We provide accurate types on hover and diagnostics by embedding the compiler
plugin with the necessary structure to also be a valid language service plugin.

### 4.2. Rationale

In my view, using JSX for embarrassingly declarative specifications is nice. It
increases the 'semantic salience' of the relevant code - you're utilizing a bit
of the mindshare around React to imply certain things about what you're
representing.

You can read more about my views here on my
[blog post](https://code.lol/post/programming/jsx-hkt/).

Example of things that might be interesting to represent this way:

- Routes, backend servers
- Lazy semantics
- Type-level pipelining code (higher kinded types)
- Data pipelines
- LLM generation (folks are already doing that apparently!)
- (obviously) frontend components

## 5. License

MIT
