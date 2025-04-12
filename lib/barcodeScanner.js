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
		// Convert the string to a number
		return Number(onecard);
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
		scanner.on("data", (dataBuffer) => {
			try {
				// Convert buffer to string, removing null bytes and trimming
				const scanData = dataBuffer.toString().replace(/\0/g, '').trim();
				if (!scanData) return; // Ignore empty scans

				const onecard = parseScanData(scanData);
				// Pass null as error and the data as the second parameter
				callback(null, onecard);
			} catch (error) {
				console.error("Error processing scan data:", error.message);
				const detailedError = new Error(`Error processing scan data: ${error.message || 'Unknown error'}`);
				detailedError.devicePath = path;
				detailedError.originalError = error;
				detailedError.type = 'scan_data_processing';
				// Pass the error as the first parameter and null as data
				callback(detailedError, null);
			}
		});
		scanner.on("error", (error) => {
			console.error("HID device error:", error.message);
			const detailedError = new Error(
				`HID device error: ${error.message || "Unknown error"}`,
			);
			detailedError.devicePath = path;
			detailedError.originalError = error;
			detailedError.type = "device_error";

			if (
				error.message.includes("disconnected") ||
				error.message.includes("not found")
			) {
				detailedError.message =
					"HID device disconnected. Attempting to reconnect...";
				detailedError.type = "device_disconnected";
				// Pass the error as the first parameter and null as data
				callback(detailedError, null);
				reconnectionManager.attemptReconnection(
					path,
					callback,
					"Barcode Scanner",
					(path, callback) => {
						startListeningToScanner(path, callback);
					},
				);
			} else {
				// Pass the error as the first parameter and null as data
				callback(detailedError, null);
			}
		});

		// Add retry mechanism for initial read with better error handling
		const maxRetries = 3;
		let retryCount = 0;

		const attemptRead = () => {
			try {
				scanner.read((error, data) => {
					if (error) {
						console.error(
							`Failed to initialize barcode scanner (attempt ${retryCount + 1}/${maxRetries}):`,
							error.message,
						);
						console.error("Error details:", error);
						console.error("Device path:", path);
						console.error(
							"Device state:",
							scanner ? "Connected" : "Disconnected",
						);

						const detailedError = new Error(
							`Failed to initialize barcode scanner after ${maxRetries} attempts: ${error.message || "Unknown error"}`,
						);
						detailedError.devicePath = path;
						detailedError.retryCount = retryCount;
						detailedError.originalError = error;
						detailedError.type = "initialization_error";

						if (retryCount < maxRetries - 1) {
							retryCount++;
							setTimeout(attemptRead, 1000); // Wait 1 second before retrying
						} else {
							// Pass the error as the first parameter and null as data
							callback(detailedError, null);
						}
					} else {
						console.log("Barcode scanner initialized successfully");
						console.log("Initial read data:", data);
						// Pass null as error and the success message as data
						callback(null, "Barcode scanner initialized successfully");
					}
				});
			} catch (readError) {
				console.error("Exception during read attempt:", readError);
				const detailedError = new Error(
					`Exception during read attempt: ${readError.message || "Unknown error"}`,
				);
				detailedError.devicePath = path;
				detailedError.retryCount = retryCount;
				detailedError.originalError = readError;
				detailedError.type = "read_exception";

				if (retryCount < maxRetries - 1) {
					retryCount++;
					setTimeout(attemptRead, 1000);
				} else {
					// Pass the error as the first parameter and null as data
					callback(detailedError, null);
				}
			}
		};

		// Start the first read attempt
		attemptRead();
	} catch (error) {
		console.error("Error starting barcode scanner:", error.message);
		console.error("Error details:", error);
		console.error("Device path:", path);
		const detailedError = new Error(
			`Error starting barcode scanner: ${error.message || "Unknown error"}`,
		);
		detailedError.devicePath = path;
		detailedError.originalError = error;
		detailedError.type = "startup_error";
		// Pass the error as the first parameter and null as data
		callback(detailedError, null);
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
