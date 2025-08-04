import { BrowserWindow } from "electron";
import { addThemeEventListeners } from "./theme/theme-listeners";
import { addWindowEventListeners } from "./window/window-listeners";
import {easyFormListener} from "./easyform/easy-form-listener"
import { xListener } from "./x/x-listener";

export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);
  addThemeEventListeners();
  easyFormListener();
  xListener()
}
