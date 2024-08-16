const {
  app,
  BrowserWindow,
  ipcMain,
  nativeImage,
  dialog,
  globalShortcut,
} = require("electron");
const path = require("path");
const connectDB = require("./db.js");
const GuestEntry = require("./GuestEntry.js");
const { startListeningToSwiper } = require("./magtekSwiper.js");
const { createObjectCsvWriter } = require("csv-writer");

let mainWindow, viewerWindow;

const appIcon = nativeImage.createFromPath(
  path.join(__dirname, "img", "favicon-32.png")
);

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: "Guestbook",
    icon: path.join(__dirname, "img", "favicon.ico"),
  });

  mainWindow.setIcon(appIcon);
  mainWindow.loadFile("index.html");
  mainWindow.on("closed", function () {
    mainWindow = null;
    app.quit(); // Ensure the application exits when the window is closed
  });
}
let debounceTimeout
const DEBOUNCE_TIME = 3000 // 3000ms or 3 seconds
const guestButtonPressCallback = async () => {
  if (debounceTimeout) {
    console.log('F24 press ignored due to active timeout.');
    return; // Ignore the press if debounce is active
  }

  debounceTimeout = setTimeout(() => {
    debounceTimeout = null; // Reset the timeout after the period
  }, DEBOUNCE_TIME);
  try {
    await GuestEntry.createAnonymousEntry();
    mainWindow.webContents.send("guest-entry", {
      name: "Guest Visitor",
      onecard: null,
      entryTime: new Date().toLocaleDateString()
    });
  } catch (error) {
    console.error("Error handling entry:", error.message);
    mainWindow.webContents.send(
      "entry-error",
      `Database error: ${error.message}`
    );
  }
};
app.on("ready", () => {
  createMainWindow();
  connectDB();

  globalShortcut.register("F24", guestButtonPressCallback);
  const onSwipe = async (error, onecardData) => {
    if (error) {
      console.error("Error during swipe:", error.message);
      mainWindow.webContents.send(
        "swipe-error",
        `Swipe error: ${error.message}`
      );
      return;
    }

    const { onecard, name } = onecardData;

    try {
      // Simply create a guest entry record
      await GuestEntry.create(onecard, name);
      mainWindow.webContents.send("guest-entry", {
        name,
        onecard,
      });
    } catch (dbError) {
      console.error("Error handling entry:", dbError.message);
      mainWindow.webContents.send(
        "entry-error",
        `Database error: ${dbError.message}`
      );
    }
  };
  console.log("Looking for Mag-Tek Swiper or other HID devices...");
  startListeningToSwiper(onSwipe).catch(console.error);
  ipcMain.on("reload-swiper", startListeningToSwiper);
});

function createViewerWindow() {
  viewerWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    title: "Guestbook Viewer",
    icon: path.join(__dirname, "img", "favicon-32.png"),
  });

  viewerWindow.setIcon(appIcon);
  viewerWindow.loadFile("viewer.html");
  viewerWindow.on("closed", function () {
    viewerWindow = null;
  });
}
// open viewer window when logo on main window is clicked
ipcMain.on("open-viewer-window", function () {
  if (!viewerWindow) {
    createViewerWindow();
  }
});
// frontend requesting entries to fill table
ipcMain.on("request-entries", async (e) => {
  try {
    const entries = await GuestEntry.getAllEntries();
    e.sender.send("load-entries", entries);
  } catch (err) {
    console.log(err.message);
  }
});
ipcMain.on("export-csv", async (event) => {
  try {
    const entries = await GuestEntry.getAllEntries();
    const currentDate = new Date().toISOString().split("T")[0];
    const defaultPath = `gb-entries_${currentDate}.csv`;

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: "Save CSV",
      defaultPath: defaultPath,
      filters: [{ name: "CSV Files", extensions: ["csv"] }],
    });

    if (canceled) return;

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: "name", title: "Name" },
        { id: "onecard", title: "Onecard ID" },
        { id: "entryTime", title: "Date/Time" },
      ],
    });

    await csvWriter.writeRecords(entries);
    console.log("CSV file written successfully");
  } catch (error) {
    console.error("Error exporting CSV:", error.message);
  }
});

ipcMain.on("flush-data", async (event) => {
  const result = await dialog.showMessageBox({
    type: "warning",
    buttons: ["Cancel", "Flush Data"],
    defaultId: 0,
    title: "Confirm Data Flush",
    message:
      "Are you sure you want to flush all the data? This action cannot be undone.",
  });

  if (result.response === 1) {
    try {
      await GuestEntry.flush();
      event.sender.send("load-entries", []);
      console.log("All entry data flushed");
    } catch (error) {
      console.error("Error flushing data:", error.message);
    }
  }
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
    globalShortcut.unregisterAll()
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createMainWindow();
  }
});
