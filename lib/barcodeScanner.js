const HID = require("node-hid");
const reconnectionManager = require("./reconnectionUtility");

let scanner;

const parseScanData = (data) => {
	try {
		// Barcode scanner data is just the ID number
		// Remove any non-numeric characters and whitespace
		const onecard = data.replace(/[^0-9]/g, '').trim();
		if (!onecard || onecard.length < 7) {
			throw new Error("Invalid scan data format");
		}
		return onecard;
	} catch (error) {
		console.error("Error parsing scan data:", error.message);
		throw error;
	}
};

const getScanner = async () => {
	try {
		const devices = HID.devices();
		const scannerDevice = devices.find(
			(device) =>
				device.vendorId === 1504 && // Symbol vendor ID in base 10
				(device.manufacturer?.includes("Symbol") ||
				 device.product?.includes("Bar Code Scanner"))
		);

		if (!scannerDevice) {
			throw new Error("No compatible barcode scanner found");
		}

		return scannerDevice.path;
	} catch (error) {
		console.error("Error finding barcode scanner:", error.message);
		throw error;
	}
};

const startListeningToScanner = async (path, callback) => {
	try {
		scanner = new HID.HID(path);
		scanner.on("data", (dataBuffer) => {
			try {
				// Convert buffer to string, removing null bytes and trimming
				const scanData = dataBuffer.toString().replace(/\0/g, '').trim();
				if (!scanData) return; // Ignore empty scans

				const onecard = parseScanData(scanData);
				callback(null, onecard);
			} catch (error) {
				console.error("Error processing scan data:", error.message);
				callback(error);
			}
		});
		scanner.on("error", (error) => {
			console.error("HID device error:", error.message);
			if (error.message.includes("disconnected") || error.message.includes("not found")) {
				callback(
					new Error("HID device disconnected. Attempting to reconnect..."),
				);
				reconnectionManager.attemptReconnection(
					path,
					callback,
					"Barcode Scanner",
					(path, callback) => {
						startListeningToScanner(path, callback);
					}
				);
			} else {
				callback(error);
			}
		});

		// Add retry mechanism for initial read
		const maxRetries = 3;
		let retryCount = 0;

		const attemptRead = () => {
			scanner.read((error, data) => {
				if (error) {
					console.error(`Failed to initialize barcode scanner (attempt ${retryCount + 1}/${maxRetries}):`, error.message);
					console.error("Error details:", error);

					if (retryCount < maxRetries - 1) {
						retryCount++;
						setTimeout(attemptRead, 1000); // Wait 1 second before retrying
					} else {
						callback(new Error(`Failed to initialize barcode scanner after ${maxRetries} attempts: ${error.message}`));
					}
				} else {
					console.log("Barcode scanner initialized successfully");
					callback(null, "Barcode scanner initialized successfully");
				}
			});
		};

		// Start the first read attempt
		attemptRead();
	} catch (error) {
		console.error("Error starting barcode scanner:", error.message);
		console.error("Error details:", error);
		callback(new Error(`Error starting barcode scanner: ${error.message}`));
	}
};

const closeScanner = () => {
	if (scanner) {
		scanner.close();
		scanner = null;
		reconnectionManager.resetAttempts();
		console.log("HID device connection closed.");
	}
};

module.exports = {
	getScanner,
	startListeningToScanner,
	closeScanner,
};
