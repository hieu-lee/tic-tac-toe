# IPC Setup Guide

This guide explains how to set up new IPC (Inter-Process Communication) channels to call the Node.js backend from the frontend.

## Architecture Overview

The IPC system consists of three main components:

1. **Channels** - Define the channel names/identifiers
2. **Context** - Exposes functions to the renderer process (frontend)  
3. **Listener** - Handles the actual backend logic

## File Structure

For each new IPC feature, create a folder under `src/helpers/ipc/` with three files:

``` md
src/helpers/ipc/your-feature/
+ your-feature-channels.ts    # Channel definitions
+ your-feature-context.ts     # Frontend context exposure
+ your-feature-listener.ts    # Backend event handlers
```

## Step-by-Step Setup

### 1. Define Channels (`your-feature-channels.ts`)

Create channel identifiers with a consistent naming pattern:

```typescript
export const CONTEXT = "yourFeatureContext" // This should always be suffixed with "Context"
export const YOUR_ACTION_CHANNEL = `${CONTEXT}:yourAction`;
export const ANOTHER_ACTION_CHANNEL = `${CONTEXT}:anotherAction`;
```

### 2. Create Context Exposure (`your-feature-context.ts`)

Expose functions to the renderer process using `contextBridge`:

```typescript
import {
  YOUR_ACTION_CHANNEL,
  CONTEXT,
  ANOTHER_ACTION_CHANNEL
} from "./your-feature-channels";

export function exposeYourFeatureContext() {
  const { contextBridge, ipcRenderer } = window.require("electron");
  contextBridge.exposeInMainWorld(CONTEXT, {
    yourAction: (param: string) => ipcRenderer.invoke(YOUR_ACTION_CHANNEL, param),
    anotherAction: () => ipcRenderer.invoke(ANOTHER_ACTION_CHANNEL),
  });
}
```

### 3. Implement Backend Logic (`your-feature-listener.ts`)

Handle the IPC calls in the main process:

```typescript
import { ipcMain, IpcMainInvokeEvent } from "electron";
import {
  YOUR_ACTION_CHANNEL,
  ANOTHER_ACTION_CHANNEL
} from "./your-feature-channels";

export function yourFeatureListener() {
  ipcMain.handle(YOUR_ACTION_CHANNEL, 
    async (_event: IpcMainInvokeEvent, param: string) => {
      try {
        // Your backend logic here
        return { success: true, data: "result" };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  );

  ipcMain.handle(ANOTHER_ACTION_CHANNEL, async () => {
    // Simple handler without parameters
    return "Hello from backend!";
  });
}
```

### 4. Register the Components

#### Add to Context Exposer (`src/helpers/ipc/context-exposer.ts`)

```typescript
import { exposeYourFeatureContext } from "./your-feature/your-feature-context";

export default function exposeContexts() {
  // ... existing contexts
  exposeYourFeatureContext();
}
```

#### Add to Listeners Register (`src/helpers/ipc/listeners-register.ts`)

```typescript
import { yourFeatureListener } from "./your-feature/your-feature-listener";

export default function registerListeners(mainWindow: BrowserWindow) {
  // ... existing listeners
  yourFeatureListener();
}
```

### 5. Add TypeScript Definitions (`src/types.d.ts`)

Define the interface for your context:

```typescript
interface YourFeatureContext {
  yourAction: (param: string) => Promise<{success: boolean, data?: string, error?: string}>;
  anotherAction: () => Promise<string>;
}

declare interface Window {
  // ... existing contexts
  yourFeatureContext: YourFeatureContext;
}
```

### 6. Use in Frontend

Access your IPC functions through the window object:

```typescript
// In your React component or helper
const result = await window.yourFeatureContext.yourAction("parameter");
const message = await window.yourFeatureContext.anotherAction();
```

## Example Usage

Based on the existing `hello` example:

```typescript
// In a React component
const handleCreateFile = async () => {
  const result = await window.helloWorldContext.createFile("Hello World!");
  console.log(result);
};

const handleSelectFile = async () => {
  const filePath = await window.helloWorldContext.selectFile();
  if (filePath) {
    await window.helloWorldContext.openFile(filePath);
  }
};
```

## Best Practices

1. **Consistent Naming**: Use a consistent naming pattern for contexts, channels, and files
2. **Error Handling**: Always wrap backend logic in try-catch blocks and return consistent response objects
3. **Type Safety**: Define proper TypeScript interfaces for all IPC functions
4. **Parameter Validation**: Validate parameters in both frontend and backend
5. **Documentation**: Comment your IPC functions, especially complex ones

## File Locations Reference

- Channel definitions: `src/helpers/ipc/your-feature/your-feature-channels.ts`
- Context exposure: `src/helpers/ipc/your-feature/your-feature-context.ts`
- Backend listeners: `src/helpers/ipc/your-feature/your-feature-listener.ts`
- Context registration: `src/helpers/ipc/context-exposer.ts`
- Listener registration: `src/helpers/ipc/listeners-register.ts`
- Type definitions: `src/types.d.ts`
- Usage examples: `src/pages/XPage.tsx`, `src/helpers/form_helpers.ts`

## IPC code convention

- Always put `_CHANNEL` suffix on the channel names
  (this follows the convention of the template)
- Keep it flat structure. Navigation tips : `types.d.ts -> your-feature-channels.ts --Go to definition of const-> your-feature-context --Go to reference--> your-feature-listener`
- Do experimentation at `./x`
- Declare all ipc used in the code base at `./easyform`
