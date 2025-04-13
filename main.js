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
	let onecard;
	let name;

	// Handle different data formats based on device type
	if (error) {
		// Only treat it as an error if it's actually an error object or has an error property
		if (error instanceof Error || error.error || error.message) {
			// Handle different types of errors
			let errorMessage;
			let errorDetails = {};

			if (error instanceof Error) {
				errorMessage = error.message;
				errorDetails = {
					message: error.message,
					stack: error.stack,
					devicePath: error.devicePath,
					retryCount: error.retryCount,
					originalError: error.originalError ? {
						message: error.originalError.message,
						stack: error.originalError.stack
					} : null
				};
			} else if (typeof error === 'object') {
				errorMessage = error.message || error.error || JSON.stringify(error);
				errorDetails = {
					rawError: error,
					devicePath: error.devicePath,
					retryCount: error.retryCount
				};
			} else {
				errorMessage = String(error);
				errorDetails = { message: errorMessage };
			}

			console.error("Error during device read:", errorMessage);
			console.error("Error details:", JSON.stringify(errorDetails, null, 2));

			windowManager
				.getMainWindow()
				.webContents.send("device-error", `Device error: ${errorMessage}`);
			soundManager.playError();
			return;
		}
		// If it's not an error, treat it as data
		if (typeof error === 'string') {
			// Skip initialization messages
			if (error.includes("Barcode scanner initialized")) {
				return;
			}
			onecard = error;
			name = null;
		} else if (error && typeof error === 'object') {
			onecard = error.onecard;
			name = error.name;
		}
	} else if (data) {
		if (typeof data === 'string') {
			// Skip initialization messages
			if (data.includes("Barcode scanner initialized")) {
				return;
			}
			onecard = data;
			name = null;
		} else if (typeof data === 'object') {
			onecard = data.onecard;
			name = data.name;
		}
	}

	// Convert onecard to number if it's a string
	if (onecard) {
		onecard = typeof onecard === 'string' ? Number(onecard) : onecard;
	}

	if (!onecard || Number.isNaN(onecard)) {
		console.error("Invalid data format received:", error || data);
		windowManager
			.getMainWindow()
			.webContents.send("device-error", "Invalid data format received from device");
		soundManager.playError();
		return;
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
		// Set up event listeners first
		HIDManager.on('data', onDeviceData);
		HIDManager.on('error', (error) => {
			console.error("Device error:", error.message);
			windowManager.getMainWindow().webContents.send("device-error", error.message);
			soundManager.playError();
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

			// Remove any existing listener first
			if (ipcListeners.has("hid-selected")) {
				ipcMain.removeListener("hid-selected", ipcListeners.get("hid-selected"));
			}

			ipcMain.once("hid-selected", hidSelectionListener);
			ipcListeners.set("hid-selected", hidSelectionListener);
		}
	} catch (error) {
		console.error("Error initializing devices:", error.message);
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
