const {
	app,
	BrowserWindow,
	ipcMain,
	nativeImage,
	dialog,
	globalShortcut,
	Menu,
} = require("electron");
const path = require("node:path");
const fs = require('node:fs');
const connectDB = require("./db.js");
const GuestEntry = require("./GuestEntry.js");
const {
	getMagtekSwiper,
	startListeningToSwiper,
	closeSwiper,
} = require("./magtekSwiper.js");
const {
	getBarcodeScanner,
	startListeningToScanner,
	closeScanner,
} = require("./barcodeScanner.js");
const { createObjectCsvWriter } = require("csv-writer");
const configManager = require('./configManager');
const windowManager = require('./windowManager.js');
const soundManager = require('./soundManager.js');

const appIcon = nativeImage.createFromPath(
	path.join(__dirname, "..", "public", "img", "favicon-32.png"),
);

const onSwipe = async (error, onecardData) => {
	if (error) {
		console.error("Error during swipe:", error.message);
		windowManager.getMainWindow().webContents.send("swipe-error", `Swipe error: ${error.message}`);
		soundManager.playError();
		return;
	}

	const { onecard, name } = onecardData;

	try {
		await GuestEntry.create(onecard, name);
		windowManager.getMainWindow().webContents.send("guest-entry", {
			name,
			onecard,
		});
		soundManager.playSuccess();
	} catch (dbError) {
		console.error("Error handling entry:", dbError.message);
		windowManager.getMainWindow().webContents.send(
			"entry-error",
			`Database error: ${dbError.message}`,
		);
		soundManager.playError();
	}
};

const onBarcodeScan = async (error, barcodeData) => {
	if (error) {
		console.error("Error during barcode scan:", error.message);
		windowManager.getMainWindow().webContents.send("scan-error", `Barcode scan error: ${error.message}`);
		soundManager.playError();
		return;
	}

	const { onecard, name } = barcodeData;

	try {
		await GuestEntry.create(onecard, name);
		windowManager.getMainWindow().webContents.send("guest-entry", {
			name: "Barcode Entry",
			onecard,
		});
		soundManager.playSuccess();
	} catch (dbError) {
		console.error("Error handling entry:", dbError.message);
		windowManager.getMainWindow().webContents.send(
			"entry-error",
			`Database error: ${dbError.message}`,
		);
		soundManager.playError();
	}
};

async function initializeSwiper() {
	console.log("Looking for Mag-Tek Swiper or other HID devices...");
	let HIDPath = await getMagtekSwiper();
	if (Array.isArray(HIDPath)) {
		console.log(
			"Multiple HID devices detected, sending select-hid event to renderer.",
		);
		windowManager.getMainWindow().webContents.send("select-hid", HIDPath);
		ipcMain.once("hid-selection", async (event, selectedPath) => {
			console.log("HID device selected:", selectedPath);
			HIDPath = selectedPath;
			try {
				windowManager.getMainWindow().setSize(400, 500);
				await startListeningToSwiper(HIDPath, onSwipe);
			} catch (error) {
				console.error("Error starting swiper after selection:", error.message);
			}
		});
	} else {
		try {
			console.log("MagTek Swiper detected, starting swiper...");
			await startListeningToSwiper(HIDPath, onSwipe);
		} catch (error) {
			console.error("Error starting swiper:", error.message);
		}
	}
}

let debounceTimeout;
const DEBOUNCE_TIME = 1500; // 1500ms or 1.5 seconds
const guestButtonPressCallback = async () => {
	if (debounceTimeout) {
		console.log("F24 press ignored due to active timeout.");
		return; // Ignore the press if debounce is active
	}

	debounceTimeout = setTimeout(() => {
		debounceTimeout = null; // Reset the timeout after the period
	}, DEBOUNCE_TIME);
	try {
		await GuestEntry.createAnonymousEntry();
		windowManager.getMainWindow().webContents.send("guest-entry", {
			name: "Guest Visitor",
			onecard: null,
			entryTime: new Date().toLocaleDateString(),
		});
		soundManager.playSuccess();
	} catch (error) {
		console.error("Error handling entry:", error.message);
		windowManager.getMainWindow().webContents.send(
			"entry-error",
			`Database error: ${error.message}`,
		);
		soundManager.playError();
	}
};

app.on("ready", async () => {
	windowManager.createMainWindow();

	try {
		await connectDB;
		console.log("Database connected successfully.");
	} catch (err) {
		console.error("Failed to connect to the database:", err.message);
		app.quit();
	}

	await configManager.checkPasswordConfig();

	globalShortcut.register("F24", guestButtonPressCallback);

	console.log("Looking for Mag-Tek Swiper or other HID devices...");
	initializeSwiper();

	// Initialize barcode scanner
	try {
		const scannerDevice = getBarcodeScanner();
		console.log("Symbol DS9208 scanner found, initializing...");
		startListeningToScanner(onBarcodeScan);
	} catch (error) {
		console.log("No Symbol DS9208 scanner found or error initializing:", error.message);
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		globalShortcut.unregisterAll();
		app.quit();
	}
});

app.on("activate", () => {
	if (!windowManager.getMainWindow()) {
		windowManager.createMainWindow();
	}
});

app.on("will-quit", () => {
	globalShortcut.unregisterAll();
	closeSwiper();
	closeScanner();
});
