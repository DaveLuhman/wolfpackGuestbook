const { app, ipcMain, globalShortcut } = require('electron');
const connectDB = require('./db');
const windowManager = require('./windowManager');
const configManager = require('./configManager');
const { guestButtonPress } = require('./handlers/guestHandler');
const { initializeDevices, setupOnboarding, cleanup } = require('./deviceManager');

app.on('ready', async () => {
  windowManager.createMainWindow();
  try {
    await connectDB;
    console.log('Local SQLite database connected successfully.');
  } catch (err) {
    console.error('Failed to connect to the database:', err.message);
    return app.quit();
  }

  setupOnboarding();

  if (!configManager.getDeploymentType()) {
    windowManager.promptForDeploymentType();
  } else {
    await initializeDevices();
  }

  globalShortcut.register('F24', guestButtonPress);
  ipcMain.on('renderer-ready', initializeDevices);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    globalShortcut.unregisterAll();
    app.quit();
  }
});

app.on('activate', () => {
  if (!windowManager.getMainWindow()) {
    windowManager.createMainWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  cleanup();
});
