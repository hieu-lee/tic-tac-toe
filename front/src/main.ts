import { app, BrowserWindow } from "electron";
import registerListeners from "./helpers/ipc/listeners-register";
// "electron-squirrel-startup" seems broken when packaging with vite
//import started from "electron-squirrel-startup";
import path from 'path';
import { exec, ChildProcess } from 'child_process';
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";

const inDevelopment = process.env.NODE_ENV === "development";

let serverProcess: ChildProcess | null = null;
let listenersRegistered = false;

function createWindow() {
  const preload = path.join(__dirname, "preload.js");
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,

      preload: preload,
    },
    titleBarStyle: "hidden",
  });

  // Register listeners only once
  if (!listenersRegistered) {
    registerListeners(mainWindow);
    listenersRegistered = true;
  }
  if (!inDevelopment) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

function startBackend() {
  // TODO:
  // if (true) { // Use this line to start backend in dev mode
  if (!inDevelopment) {
    console.log("Starting backend ...")
    let scriptPath: string;
    if (app.isPackaged) {
      scriptPath = path.join(process.resourcesPath, 'assets/python', 'server');
    } else {
      scriptPath = path.join(app.getAppPath(), 'src/assets/python', 'server');
    }

    console.log(`Running bash script: ${scriptPath}`);

    const fs = require('fs');
    if (!fs.existsSync(scriptPath)) {
      console.error(`Script not found at: ${scriptPath}`);
      throw new Error(`Script not found at: ${scriptPath}`);
    }

    try {
      serverProcess = exec(`${scriptPath}`);

      if (serverProcess.stderr) {
        serverProcess.stderr.on('data', (data) => {
          console.error('Script stderr:', data);
          // Note: stderr doesn't always mean error, some programs output to stderr
        });
      }

      console.log("Server starts successfully");
    } catch (error) {
      console.error('Execution error:', error);
      throw error;
    }
  }
}

app.whenReady()
  .then(() => {
    startBackend();
    createWindow();
  })
// .then(() => {
//   // FIXME: https://github.com/MarshallOfSound/electron-devtools-installer is not working
//   installExtension(REACT_DEVELOPER_TOOLS)
//     .then((ext) => console.log(`Added Extension:  ${ext.name}`))
//     .catch((err) => console.log('An error occurred: ', err));
// });

//osX only
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("before-quit", () => {
  if (serverProcess) {
    console.log("Stopping server before quit...");
    serverProcess.kill();
    serverProcess = null;
  }
});
//osX only ends
