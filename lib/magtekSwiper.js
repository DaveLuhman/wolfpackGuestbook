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
			name
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

		// Set up data handler first
		swiper.on("data", (dataBuffer) => {
			try {
				const swipeData = dataBuffer.toString().replace(/\0/g, "").trim();
				if (!swipeData) return; // Ignore empty swipes

				console.log('Raw swipe data:', swipeData);
				const onecardData = parseSwipeData(swipeData);
				console.log('Parsed swipe data:', onecardData);

				// Clear any remaining data in the buffer with a timeout
				try {
					const remainingData = swiper.readTimeout(100); // 100ms timeout
					if (remainingData) {
						console.log('Cleared additional data from buffer');
					}
				} catch (readError) {
					// Ignore timeout errors
					if (!readError.message.includes('timeout')) {
						console.error('Error reading remaining data:', readError);
					}
				}

				// Pass null as error and the data as the second parameter
				callback(null, onecardData);
			} catch (error) {
				console.error("Error processing swipe data:", error.message);
				console.error("Raw data that caused error:", dataBuffer.toString());
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

				callback(detailedError, null);
			}
		});

		// Set up error handler
		swiper.on("error", (error) => {
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
					"MagTek Swiper",
					(path, callback) => {
						startListeningToSwiper(path, callback);
					},
				);
			} else {
				callback(detailedError, null);
			}
		});

		console.log("MagTek swiper initialized successfully");
		return true;
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
		callback(detailedError, null);
		throw error;
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
