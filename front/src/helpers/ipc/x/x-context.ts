import {
  HELLO_WORLD_CHANNEL,
  CONTEXT,
  CREATE_FILE_CHANNEL,
  RUN_BASH_SCRIPT_CHANNEL,
  RUN_BIN_CHANNEL,
  SELECT_FILE,
  OPEN_FILE,
  SELECT_DIRECTORY
} from "./x-channels";

export function exposeXContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");
  contextBridge.exposeInMainWorld(CONTEXT, {
    helloWorld: () => ipcRenderer.invoke(HELLO_WORLD_CHANNEL),
    createFile: (content: string) => ipcRenderer.invoke(CREATE_FILE_CHANNEL, content),
    runBashScript: () => ipcRenderer.invoke(RUN_BASH_SCRIPT_CHANNEL),
    runBin: () => ipcRenderer.invoke(RUN_BIN_CHANNEL),
    selectFile: () => ipcRenderer.invoke(SELECT_FILE),
    openFile: (path: string) => ipcRenderer.invoke(OPEN_FILE, path),
    selectDirectory: () => ipcRenderer.invoke(SELECT_DIRECTORY),
  });
}
