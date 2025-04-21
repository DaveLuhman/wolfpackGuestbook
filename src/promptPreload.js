const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('Electron', {
  sendResponse: (channel, value) => {
    ipcRenderer.send(channel, value);
  }
});