const HID = require("node-hid");
const reconnectionManager = require("./reconnectionUtility");

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

const getMagtekSwiper = async (path) => {
	try {
		if (!path) {
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
			path = magtekDevice.path;
		}

		return new HID.HID(path);
	} catch (error) {
		console.error("Error finding MagTek device:", error.message);
		throw error;
	}
};

const startListeningToSwiper = async (device, callback) => {
	try {
		// Set up data handler first
		device.on("data", (dataBuffer) => {
			try {
				const swipeData = dataBuffer.toString().replace(/\0/g, "").trim();
				if (!swipeData) return; // Ignore empty swipes

				console.log('Raw swipe data:', swipeData);
				const onecardData = parseSwipeData(swipeData);
				console.log('Parsed swipe data:', onecardData);

				// Clear any remaining data in the buffer with a timeout
				try {
					const remainingData = device.readTimeout(100); // 100ms timeout
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
				detailedError.devicePath = device.path;
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
		device.on("error", (error) => {
			console.error("HID device error:", error.message);
			const detailedError = new Error(`HID device error: ${error.message || 'Unknown error'}`);
			detailedError.devicePath = device.path;
			detailedError.originalError = error;
			detailedError.type = 'device_error';

			if (error.message.includes('disconnected') || error.message.includes('not found')) {
				detailedError.message = 'HID device disconnected. Attempting to reconnect...';
				detailedError.type = 'device_disconnected';
				callback(detailedError, null);
				reconnectionManager.attemptReconnection(
					device.path,
					callback,
					'MagTek Swiper',
					(path, callback) => {
						startListeningToSwiper(path, callback);
					}
				);
			} else {
				callback(detailedError, null);
			}
		});

		return device;
	} catch (error) {
		console.error("Error setting up MagTek device:", error.message);
		throw error;
	}
};

const closeSwiper = (device) => {
	try {
		if (device) {
			device.close();
		}
	} catch (error) {
		console.error("Error closing MagTek device:", error.message);
	}
};

module.exports = {
	getMagtekSwiper,
	startListeningToSwiper,
	closeSwiper,
};
