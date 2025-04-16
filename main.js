const {
	app,
	ipcMain,
	nativeImage,
} = require("electron");
const path = require("node:path");
const connectDB = require("./db.js");
const GuestEntry = require("./GuestEntry.js");
const HIDManager = require("./HIDManager");
const configManager = require("./configManager");
const windowManager = require("./windowManager");
const soundManager = require("./soundManager");

const appIcon = nativeImage.createFromPath(
	path.join(__dirname, "img", "favicon-32.png"),
);

// Store IPC listeners for cleanup
const ipcListeners = new Map();

const onDeviceData = async (error, data) => {
	if (error) {
		windowManager.getMainWindow().webContents.send("device-error", error.message);
		soundManager.playError();
		return;
	}

	try {
		await GuestEntry.create(data.onecard, data.name);
		windowManager.getMainWindow().webContents.send("guest-entry", data);
		soundManager.playSuccess();
	} catch (dbError) {
		console.error("Error handling entry:", dbError.message);
		windowManager.getMainWindow().webContents.send("entry-error", `Database error: ${dbError.message}`);
		soundManager.playError();
	}
};

async function initializeDevices() {
	try {
		HIDManager.off('data', onDeviceData);
		HIDManager.off('error', (error) => {
			windowManager.getMainWindow().webContents.send("device-error", error.message);
			soundManager.playError();
		});

		const devicesNeedingConfig = await HIDManager.initializeDevices();

		HIDManager.on('data', onDeviceData);
		HIDManager.on('error', (error) => {
			windowManager.getMainWindow().webContents.send("device-error", error.message);
			soundManager.playError();
		});

		if (devicesNeedingConfig) {
			windowManager.getMainWindow().webContents.send("select-hid", devicesNeedingConfig);

			const hidSelectionListener = async (event, { path, type }) => {
				try {
					windowManager.getMainWindow().setSize(400, 500);
					await HIDManager.setDevice(path, type);
					configManager.setSelectedDevice(type, path);
				} catch (error) {
					windowManager.getMainWindow().webContents.send("device-error", error.message);
				}
			};

			if (ipcListeners.has("hid-selected")) {
				ipcMain.removeListener("hid-selected", ipcListeners.get("hid-selected"));
			}

			ipcMain.once("hid-selected", hidSelectionListener);
			ipcListeners.set("hid-selected", hidSelectionListener);
		}
	} catch (error) {
		windowManager.getMainWindow().webContents.send("device-error", error.message);
	}
}

function cleanup() {
	// Remove all IPC listeners
	for (const [event, listener] of ipcListeners) {
		ipcMain.removeListener(event, listener);
	}
	ipcListeners.clear();

	// Close HID manager
	HIDManager.close().catch(error => {
		console.error("Error closing HID manager:", error);
	});
}

app.on("ready", async () => {
	try {
		windowManager.createMainWindow();

		await connectDB;
		console.log("Database connected successfully.");

		await configManager.checkPasswordConfig();

		console.log("Looking for HID devices...");
		await initializeDevices();
	} catch (err) {
		console.error("Failed to initialize application:", err.message);
		app.quit();
	}
});

app.on("window-all-closed", () => {
	cleanup();
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (!windowManager.getMainWindow()) {
		windowManager.createMainWindow();
	}
});


