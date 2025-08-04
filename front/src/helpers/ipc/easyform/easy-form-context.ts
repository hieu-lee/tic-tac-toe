import {
  CONTEXT,
  SELECT_FILE_CHANNEL,
  SELECT_FILES_CHANNEL,
  OPEN_FILE_CHANNEL,
  SELECT_DIRECTORY_CHANNEL,
  READ_FILE_CHANNEL,
  SAVE_IMAGE_CHANNEL,
  IS_FILE_EXISTENT_CHANNEL
} from "./easy-form-channels";

export function exposeEasyFormContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");
  contextBridge.exposeInMainWorld(CONTEXT, {
    selectFile: () => ipcRenderer.invoke(SELECT_FILE_CHANNEL),
    selectFiles: () => ipcRenderer.invoke(SELECT_FILES_CHANNEL),
    openFile: (path: string) => ipcRenderer.invoke(OPEN_FILE_CHANNEL, path),
    selectDirectory: () => ipcRenderer.invoke(SELECT_DIRECTORY_CHANNEL),
    readFile: (path: string) => ipcRenderer.invoke(READ_FILE_CHANNEL, path),
    saveImage: (dataUrl: string) => ipcRenderer.invoke(SAVE_IMAGE_CHANNEL, dataUrl),
    isFileExistent: (filePath: string) => ipcRenderer.invoke(IS_FILE_EXISTENT_CHANNEL, filePath)
  });
}
