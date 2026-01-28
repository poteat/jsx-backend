import type { AppProps, ExpressJsxElement } from "../types.js";
import { jsx } from "../jsx-runtime.js";

export function App(props: AppProps): ExpressJsxElement<AppProps> {
  return jsx(App, props);
}
