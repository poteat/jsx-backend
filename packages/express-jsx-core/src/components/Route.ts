import type { RouteProps, ExpressJsxElement } from "../types.js";
import { jsx } from "../jsx-runtime.js";

export function Route(props: RouteProps): ExpressJsxElement<RouteProps> {
  return jsx(Route, props);
}
