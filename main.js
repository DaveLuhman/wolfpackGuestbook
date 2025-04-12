const {
	app,
	BrowserWindow,
	ipcMain,
	nativeImage,
	dialog,
	Menu,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const connectDB = require("./db.js");
const GuestEntry = require("./GuestEntry.js");
const HIDManager = require("./HIDManager");
const { createObjectCsvWriter } = require("csv-writer");
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
		console.error("Error during device read:", error.message);
		windowManager
			.getMainWindow()
			.webContents.send("device-error", `Device error: ${error.message}`);
		soundManager.playError();
		return;
	}

	// Handle different data formats based on device type
	let onecard;
	let name;
	if (typeof data === 'string') {
		// Barcode scanner data (just the ID)
		onecard = data;
		name = null; // No name from barcode
	} else {
		// MSR data (object with onecard and name)
		onecard = data.onecard;
		name = data.name;
	}

	try {
		await GuestEntry.create(onecard, name);
		windowManager.getMainWindow().webContents.send("guest-entry", {
			name,
			onecard,
		});
		soundManager.playSuccess();
	} catch (dbError) {
		console.error("Error handling entry:", dbError.message);
		windowManager
			.getMainWindow()
			.webContents.send("entry-error", `Database error: ${dbError.message}`);
		soundManager.playError();
	}
};

async function initializeDevices() {
	try {
		// Set up event listeners
		HIDManager.on('data', onDeviceData);
		HIDManager.on('error', (error) => {
			console.error("Device error:", error.message);
			windowManager.getMainWindow().webContents.send("device-error", error.message);
		});

		// Initialize devices and get any that need manual configuration
		const devicesNeedingConfig = await HIDManager.initializeDevices();

		if (devicesNeedingConfig) {
			console.log("Some devices need manual configuration, showing selection dialog...");
			windowManager.getMainWindow().webContents.send("select-hid", devicesNeedingConfig);

			// Store the listener for cleanup
			const hidSelectionListener = async (event, { path, type }) => {
				console.log(`HID device selected: ${path} (${type})`);
				try {
					windowManager.getMainWindow().setSize(400, 500);
					await HIDManager.setDevice(path, type);
					// Save the selected device
					configManager.setSelectedDevice(type, path);
				} catch (error) {
					console.error("Error setting device:", error.message);
					windowManager.getMainWindow().webContents.send("device-error", error.message);
				}
			};

			ipcMain.once("hid-selected", hidSelectionListener);
			ipcListeners.set("hid-selected", hidSelectionListener);
		}
	} catch (error) {
		console.error("Error initializing devices:", error.message);
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
