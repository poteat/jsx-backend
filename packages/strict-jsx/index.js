// Make the module both callable (for TS language service plugin)
// and an object with named exports (for programmatic use).
// CJS bundles `export default` as { default: fn }, but TS plugin
// loader expects require("strict-jsx") to be directly callable.
const mod = require("./dist/index.js");
const init = mod.default;
Object.keys(mod).forEach(k => { if (k !== "default") init[k] = mod[k]; });
module.exports = init;
