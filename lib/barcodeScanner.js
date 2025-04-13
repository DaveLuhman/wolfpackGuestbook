const HID = require("node-hid");
const reconnectionManager = require("./reconnectionUtility");

let scanner;

const parseScanData = (data) => {
	try {
		console.log("Parsing scan data:", data);
		// Remove carets and any non-numeric characters
		const onecard = data.replace(/[^0-9]/g, '').trim();
		console.log("After removing non-numeric characters:", onecard);

		if (!onecard || onecard.length < 7) {
			throw new Error("Invalid scan data format");
		}
		// Convert the string to a number
		const result = Number(onecard);
		console.log("Final parsed number:", result);
		return result;
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
					device.product?.includes("Bar Code Scanner")),
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

		// Set up error handler first
		scanner.on("error", (error) => {
			console.error("HID device error:", error.message);
			const detailedError = new Error(`HID device error: ${error.message || 'Unknown error'}`);
			detailedError.devicePath = path;
			detailedError.originalError = error;
			detailedError.type = 'device_error';

			if (error.message.includes("disconnected") || error.message.includes("not found")) {
				detailedError.message = "HID device disconnected. Attempting to reconnect...";
				detailedError.type = 'device_disconnected';
				callback(detailedError, null);
				reconnectionManager.attemptReconnection(
					path,
					callback,
					"Barcode Scanner",
					(path, callback) => {
						startListeningToScanner(path, callback);
					}
				);
			} else {
				callback(detailedError, null);
			}
		});

		// Set up data handler
		scanner.on("data", (dataBuffer) => {
			try {
				// Convert buffer to string, removing null bytes and trimming
				const scanData = dataBuffer.toString().replace(/\0/g, '').trim();
				if (!scanData) return; // Ignore empty scans

				// Log the raw data for debugging
				console.log("Raw scan data:", scanData);
				console.log("Buffer length:", dataBuffer.length);

				// Try to parse the scan data
				const onecard = parseScanData(scanData);
				// Pass null as error and the data as the second parameter
				callback(null, { onecard });
			} catch (error) {
				console.error("Error processing scan data:", error.message);
				console.error("Raw data that caused error:", dataBuffer.toString());
				const detailedError = new Error(`Error processing scan data: ${error.message || 'Unknown error'}`);
				detailedError.devicePath = path;
				detailedError.originalError = error;
				detailedError.type = 'scan_data_processing';
				callback(detailedError, null);
			}
		});

		console.log("Barcode scanner initialized successfully");
		return true;
	} catch (error) {
		console.error("Error starting barcode scanner:", error.message);
		console.error("Error details:", error);
		console.error("Device path:", path);
		const detailedError = new Error(`Error starting barcode scanner: ${error.message || 'Unknown error'}`);
		detailedError.devicePath = path;
		detailedError.originalError = error;
		detailedError.type = 'startup_error';
		callback(detailedError, null);
		throw error;
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
