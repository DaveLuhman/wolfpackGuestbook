const {
	app,
	ipcMain,
	globalShortcut,
} = require("electron");
const connectDB = require("./db.js");
const GuestEntry = require("./lib/standalone/GuestEntry.js");
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
const configManager = require('./configManager');
const windowManager = require('./windowManager.js');
const soundManager = require('./soundManager.js');
const [registerThisDevice, deviceHeartbeat] = require("./lib/server/devices.js");


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
	let HIDPath = getMagtekSwiper();
	if (Array.isArray(HIDPath)) {
		windowManager.getMainWindow().webContents.send("select-swiper-hid", HIDPath);
		ipcMain.once("swiper-hid-selection", async (event, selectedPath) => {
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

async function initializeBarcodeScanner() {
	console.log("Looking for Barcode Scanner or other HID devices...");
	let HIDPath = getBarcodeScanner();
	if (Array.isArray(HIDPath)) {
		console.log(
			"Multiple HID devices detected, sending select-barcode-hid event to renderer.",
		);
		windowManager.getMainWindow().webContents.send("select-barcode-hid", HIDPath);
		ipcMain.once("barcode-hid-selection", async (event, selectedPath) => {
			console.log("Barcode HID device selected:", selectedPath);
			HIDPath = selectedPath;
			try {
				windowManager.getMainWindow().setSize(400, 500);
				await startListeningToScanner(HIDPath, onBarcodeScan);
			} catch (error) {
				console.error("Error starting barcode scanner after selection:", error.message);
			}
		});
	} else {
		try {
			console.log("Barcode Scanner detected, starting scanner...");
			await startListeningToScanner(HIDPath, onBarcodeScan);
		} catch (error) {
			console.error("Error starting barcode scanner:", error.message);
		}
	}
}

let debounceTimeout;
const DEBOUNCE_TIME = 1500; // 1500ms or 1.5 seconds
const guestButtonPressCallback = async () => {
	if (debounceTimeout) {
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

	ipcMain.on('standalone-deployment-selected', () => {
		configManager.setDeploymentType('standalone');
		windowManager.deviceOnboardingWindow = null;
	});

	ipcMain.on('device-onboarding-submit', async (event, { serverUrl, friendlyName, location }) => {
		try {
			// Save the config (or do registration, etc.)
			configManager.setServerUrl(serverUrl);
			configManager.setDeviceFriendlyName(friendlyName);
			configManager.setDeviceLocation(location);
			configManager.setDeploymentType('client-server');
			// You may want to call registerThisDevice() here as well
			const response = await registerThisDevice();
			configManager.setServerToken(response.uuid);
			configManager.setDeviceId(response.id);

			event.sender.send('device-onboarding-success');
			if (windowManager.deviceOnboardingWindow) {
				windowManager.deviceOnboardingWindow.close();
			}
		} catch (err) {
			event.sender.send('device-onboarding-error', err.message);
		}
	});
	// First run: prompt for deployment type
	if (!configManager.getDeploymentType()) {
		windowManager.promptForDeploymentType();
	}

	try {
		await connectDB;
		console.log("Local SQLite database connected successfully.");
	} catch (err) {
		console.error("Failed to connect to the database:", err.message);
		app.quit();
	}

	await configManager.checkPasswordConfig();

	globalShortcut.register("F24", guestButtonPressCallback);

	ipcMain.on('renderer-ready', () => {
		// Now safe to send select-swiper-hid and select-barcode-hid
		// (You may need to store the HIDPath values until this fires)
		initializeSwiper();
		initializeBarcodeScanner();
	});

	ipcMain.on('standalone-deployment', (event) => {
		configManager.setDeploymentType('standalone');
		event.sender.send('device-onboarding-success');
		if (windowManager.deviceOnboardingWindow) {
			windowManager.deviceOnboardingWindow.close();
		}
	});
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
