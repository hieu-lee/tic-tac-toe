import { exposeThemeContext } from "./theme/theme-context";
import { exposeWindowContext } from "./window/window-context";
import { exposeEasyFormContext } from "./easyform/easy-form-context";
import { exposeXContext } from "./x/x-context";

export default function exposeContexts() {
  exposeWindowContext();
  exposeThemeContext();
  exposeEasyFormContext();
  exposeXContext();
}
