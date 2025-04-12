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
			onecard: onecard[0].trim(),
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

				const onecardData = parseSwipeData(swipeData);
				callback(null, onecardData);
			} catch (error) {
				console.error("Error processing swipe data:", error.message);
				callback(error);
			}
		});
		swiper.on("error", (error) => {
			console.error("HID device error:", error.message);
			if (
				error.message.includes("disconnected") ||
				error.message.includes("not found")
			) {
				callback(
					new Error("HID device disconnected. Attempting to reconnect..."),
				);
				reconnectionManager.attemptReconnection(
					path,
					callback,
					"MagTek Swiper",
					(path, callback) => {
						startListeningToSwiper(path, callback);
					},
				);
			} else {
				callback(error);
			}
		});

		// Send a test read to verify the connection
		swiper.read((error, data) => {
			if (error) {
				console.error("Failed to initialize MagTek swiper:", error.message);
				console.error("Error details:", error);
				callback(
					new Error(`Failed to initialize MagTek swiper: ${error.message}`),
				);
			} else {
				console.log("MagTek swiper initialized successfully");
				callback(null, "MagTek swiper initialized successfully");
			}
		});
	} catch (error) {
		console.error("Error starting MagTek swiper:", error.message);
		console.error("Error details:", error);
		callback(new Error(`Error starting MagTek swiper: ${error.message}`));
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
