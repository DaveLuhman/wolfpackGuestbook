const HID = require("node-hid");

let scanner;
let reconnectionAttempts = 0;
const MAX_RECONNECTION_ATTEMPTS = 10;
let isReconnecting = false;

const parseBarcodeData = (data) => {
	try {
		// Remove any non-numeric characters and extract the 7-digit number
		const barcode = data.replace(/[^\d]/g, "");
		if (barcode.length !== 7) {
			throw new Error("Invalid barcode length");
		}
		return { onecard: barcode, name: null };
	} catch (error) {
		console.error("Error parsing barcode:", error.message);
		throw new Error("Unable to parse barcode data");
	}
};

const getBarcodeScanner = () => {
	try {
		const devices = HID.devices();
		const scannerDevice = devices.find(
			(device) =>
				device.vendorId === 1504 && // Symbol vendor ID in base 10
				(device.manufacturer?.includes("Symbol") ||
					device.product?.includes("Bar Code Scanner")),
		);

		if (!scannerDevice) {
			throw new Error("Symbol DS9208 scanner not found");
		}

		return scannerDevice;
	} catch (error) {
		console.error("Error finding barcode scanner:", error.message);
		throw error;
	}
};

const startListeningToScanner = (callback) => {
	try {
		const scannerDevice = getBarcodeScanner();
		scanner = new HID.HID(scannerDevice.path);

		scanner.on("data", (dataBuffer) => {
			try {
				const barcodeData = dataBuffer.toString("utf8");
				const parsedData = parseBarcodeData(barcodeData);
				callback(null, parsedData);
			} catch (error) {
				callback(error);
			}
		});

		scanner.on("error", (error) => {
			console.error("Scanner error:", error.message);
			callback(new Error("Scanner disconnected. Attempting to reconnect..."));
			attemptReconnection(scannerDevice.path, callback);
		});

		return scanner;
	} catch (error) {
		console.error("Error initializing scanner:", error.message);
		throw error;
	}
};

const closeScanner = () => {
	if (scanner) {
		scanner.close();
		scanner = null;
	}
};

const attemptReconnection = (path, callback) => {
	if (isReconnecting) {
   return;
 }
	isReconnecting = true;

	if (reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
		console.error(
			"Max reconnection attempts reached. Stopping further attempts.",
		);
		callback(
			new Error("Unable to reconnect to scanner after multiple attempts."),
		);
		isReconnecting = false;
		return;
	}

	reconnectionAttempts++;
	setTimeout(async () => {
		try {
			if (scanner) {
				scanner.close();
				scanner = null;
			}
			console.log(
				`Attempting to reconnect to scanner... (Attempt ${reconnectionAttempts})`,
			);
			scanner = new HID.HID(path);
			scanner.on("data", (dataBuffer) => {
				try {
					const barcodeData = dataBuffer.toString("utf8");
					const parsedData = parseBarcodeData(barcodeData);
					callback(null, parsedData);
				} catch (error) {
					callback(error);
				}
			});
			scanner.on("error", (error) => {
				console.error("Scanner error:", error.message);
				callback(new Error("Scanner disconnected. Attempting to reconnect..."));
				attemptReconnection(path, callback);
			});
		} catch (error) {
			console.error("Reconnection attempt failed:", error.message);
			attemptReconnection(path, callback);
		} finally {
			isReconnecting = false;
		}
	}, 5000);
};

module.exports = {
	getBarcodeScanner,
	startListeningToScanner,
	closeScanner,
};
