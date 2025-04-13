const HID = require("node-hid");
const reconnectionManager = require("./reconnectionUtility");

let swiper;

const parseSwipeData = (rawData) => {
	try {
		const data = rawData.replace(/\0/g, "").trim(); // Remove null bytes and trim
		if (!data) {
			throw new Error("Empty swipe data");
		}

		// Extract name and onecard using regex
		const regex = /(?<=\^)(.*?)(?=\^)/;
		const rawName = regex.exec(data);
		if (!rawName || !rawName[0]) {
			throw new Error("Could not parse name from swipe");
		}
		const name = rawName[0].trim();

		const onecardRegex = /(\d{7})\s{3}/;
		const onecard = onecardRegex.exec(data);
		if (!onecard || !onecard[0]) {
			throw new Error("Could not parse Onecard number from swipe");
		}

		return {
			onecard: Number(onecard[0].trim()),
			name: name.replace(/[^\w\s-]/g, ""), // Remove any non-word characters except spaces and hyphens
		};
	} catch (error) {
		console.error("Error parsing swipe data:", error.message);
		throw new Error("Unable to determine Onecard/Name from provided input");
	}
};

const getMagtekSwiper = async () => {
	try {
		const devices = HID.devices();
		const magtekDevice = devices.find(
			(device) =>
				device.vendorId === 2049 && // MagTek vendor ID in base 10
				(device.manufacturer === "Mag-Tek" ||
					device.product === "USB Swipe Reader"),
		);

		if (!magtekDevice) {
			throw new Error("No compatible MagTek MSR device found");
		}

		return magtekDevice.path;
	} catch (error) {
		console.error("Error finding MagTek device:", error.message);
		throw error;
	}
};

const startListeningToSwiper = async (path, callback) => {
	try {
		swiper = new HID.HID(path);
		swiper.on("data", (dataBuffer) => {
			try {
				const swipeData = dataBuffer.toString().replace(/\0/g, "").trim();
				if (!swipeData) return; // Ignore empty swipes

				// Check if this is initialization data (first read after connection)
				if (dataBuffer.length === 64 && dataBuffer[0] === 0x01 && dataBuffer[1] === 0x01 && dataBuffer[2] === 0x00) {
					console.log("Received initialization data, ignoring...");
					return;
				}

				const onecardData = parseSwipeData(swipeData);
				// Pass null as error and the data as the second parameter
				callback(null, onecardData);
			} catch (error) {
				console.error("Error processing swipe data:", error.message);
				const detailedError = new Error(`Error processing swipe data: ${error.message || 'Unknown error'}`);
				detailedError.devicePath = path;
				detailedError.originalError = error;
				detailedError.type = 'swipe_data_processing';

				// Add more context to the error message
				if (error.message.includes('Invalid swipe data')) {
					detailedError.message = 'Invalid card swipe. Please try again.';
				} else if (error.message.includes('No track data')) {
					detailedError.message = 'No card data detected. Please try swiping again.';
				}

				// Pass the error as the first parameter and null as data
				callback(detailedError, null);
			}
		});
		swiper.on("error", (error) => {
			console.error("HID device error:", error.message);
			const detailedError = new Error(`HID device error: ${error.message || 'Unknown error'}`);
			detailedError.devicePath = path;
			detailedError.originalError = error;
			detailedError.type = 'device_error';

			if (error.message.includes("disconnected") || error.message.includes("not found")) {
				detailedError.message = "HID device disconnected. Attempting to reconnect...";
				detailedError.type = 'device_disconnected';
				// Pass the error as the first parameter and null as data
				callback(detailedError, null);
				reconnectionManager.attemptReconnection(
					path,
					callback,
					"MagTek Swiper",
					(path, callback) => {
						startListeningToSwiper(path, callback);
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
				swiper.read((error, data) => {
					if (error) {
						console.error(`Failed to initialize MagTek swiper (attempt ${retryCount + 1}/${maxRetries}):`, error.message);
						console.error("Error details:", error);
						console.error("Device path:", path);
						console.error("Device state:", swiper ? "Connected" : "Disconnected");

						const detailedError = new Error(`Failed to initialize MagTek swiper after ${maxRetries} attempts: ${error.message || 'Unknown error'}`);
						detailedError.devicePath = path;
						detailedError.retryCount = retryCount;
						detailedError.originalError = error;
						detailedError.type = 'initialization_error';

						if (retryCount < maxRetries - 1) {
							retryCount++;
							setTimeout(attemptRead, 1000); // Wait 1 second before retrying
						} else {
							// Pass the error as the first parameter and null as data
							callback(detailedError, null);
						}
					} else {
						console.log("MagTek swiper initialized successfully");
						console.log("Initial read data:", data);
						// Don't pass initialization success as data to the callback
					}
				});
			} catch (readError) {
				console.error("Exception during read attempt:", readError);
				const detailedError = new Error(`Exception during read attempt: ${readError.message || 'Unknown error'}`);
				detailedError.devicePath = path;
				detailedError.retryCount = retryCount;
				detailedError.originalError = readError;
				detailedError.type = 'read_exception';

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
		console.error("Error starting MagTek swiper:", error.message);
		console.error("Error details:", error);
		console.error("Device path:", path);
		const detailedError = new Error(
			`Error starting MagTek swiper: ${error.message || "Unknown error"}`,
		);
		detailedError.devicePath = path;
		detailedError.originalError = error;
		detailedError.type = "startup_error";
		// Pass the error as the first parameter and null as data
		callback(detailedError, null);
	}
};

const closeSwiper = () => {
	if (swiper) {
		swiper.close();
		swiper = null;
		reconnectionManager.resetAttempts();
		console.log("HID device connection closed.");
	}
};

module.exports = {
	getMagtekSwiper,
	startListeningToSwiper,
	closeSwiper,
};
