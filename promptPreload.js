const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendResponse: (channel, value) => {
    ipcRenderer.send(channel, value);
  }
});