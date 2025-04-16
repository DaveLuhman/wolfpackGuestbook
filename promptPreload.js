const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'Electron',
  {
    sendResponse: (channel, value) => {
      // Allow any channel that starts with 'password-prompt-response-'
      if (channel.startsWith('password-prompt-response-')) {
        ipcRenderer.send(channel, value);
      }
    }
  }
);