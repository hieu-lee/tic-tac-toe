import { ipcMain, IpcMainInvokeEvent } from "electron";
import { dialog, shell } from "electron";
import path from 'path';
import fs from 'fs';
import {
  SELECT_FILE_CHANNEL,
  SELECT_FILES_CHANNEL,
  OPEN_FILE_CHANNEL,
  SELECT_DIRECTORY_CHANNEL,
  READ_FILE_CHANNEL,
  SAVE_IMAGE_CHANNEL,
  IS_FILE_EXISTENT_CHANNEL
} from "./easy-form-channels";

export function easyFormListener() {
  ipcMain.handle(SELECT_FILE_CHANNEL, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle(SELECT_FILES_CHANNEL, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'docx'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths;
  });

  ipcMain.handle(OPEN_FILE_CHANNEL, async (_event: IpcMainInvokeEvent, path: string) => {
    return await shell.openPath(path);
  });

  ipcMain.handle(READ_FILE_CHANNEL, async (
    _event: IpcMainInvokeEvent,
    filePath: string
  ) => {
    try {
      // Read the PDF file as a Buffer
      const fs = require('fs/promises');
      const fileBuffer = await fs.readFile(filePath);

      // Return the file as an object
      return {
        content: fileBuffer.toString("base64"), // Convert to base64 for transport
      };
    } catch (error) {
      console.error("Error reading PDF file:", error);
      throw error;
    }
  });

  ipcMain.handle(SAVE_IMAGE_CHANNEL, async (
    _event: IpcMainInvokeEvent,
    dataUrl: string
  ) => {
    try {
      const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (!matches) {
        throw new Error("Invalid data URL format");
      }

      const extension = matches[1];
      const base64Data = matches[2];

      const buffer = Buffer.from(base64Data, 'base64');

      const os = require('os');
      const dirPath = path.join(os.homedir(), '.EasyFormImages');
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const fileName = `${Date.now()}.${extension}`;
      const fullPath = path.join(dirPath, fileName);

      fs.writeFileSync(fullPath, buffer);

      return fullPath;
    } catch (error) {
      console.error("Error saving image:", error);
      throw error;
    }
  });

  ipcMain.handle(SELECT_DIRECTORY_CHANNEL, async (): Promise<DirWFilePaths | null> => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    let filePaths = getAllFilesAbsolute(result.filePaths[0]);

    filePaths = filePaths.filter(filePath =>
      filePath.endsWith('.pdf') || 
      filePath.endsWith('.docx') ||
      filePath.endsWith('.txt') ||
      filePath.endsWith('.png') ||
      filePath.endsWith('.jpg') ||
      filePath.endsWith('.jpeg')
    )

    return {
      path: result.filePaths[0],
      filePaths
    };
  });

  ipcMain.handle(IS_FILE_EXISTENT_CHANNEL, async (
    _event: IpcMainInvokeEvent,
    filePath: string
  ) => {
    console.log("Checking if file exists:", filePath);
    return isFileExistent(filePath)
  });
}

function isFileExistent(filePath: string) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

function getAllFilesAbsolute(dir: string) {
  let results: string[] = [];
  const list = fs.readdirSync(dir);

  list.forEach(file => {
    if (file.startsWith('.')) return;
    
    const fullPath = path.resolve(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFilesAbsolute(fullPath));
    } else if (stat && stat.isFile()) {
      results.push(fullPath);
    }
  });

  return results;
}
