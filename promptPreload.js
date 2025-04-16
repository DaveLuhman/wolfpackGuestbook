const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'Electron',
  {
    sendResponse: (channel, value) => {
      // Whitelist the channels we want to allow
      const validChannels = ['password-prompt-response'];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, value);
      }
    }
  }
);