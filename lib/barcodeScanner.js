const HID = require("node-hid");
const reconnectionManager = require("./reconnectionUtility");

let scanner;

const getScanner = async () => {
	try {
		const devices = HID.devices();
		let devicePath;
		const scannerDevice = devices.find(
			(device) => device.vendorId === 1504 || device.product === "Symbol Bar Code Scanner",
		);
		if (scannerDevice) {
			devicePath = scannerDevice.path;
		} else {
			devicePath = devices;
		}
		return devicePath;
	} catch (error) {
		console.error(error.message);
		throw error;
	}
};

const startListeningToScanner = async (path, callback) => {
	try {
		scanner = new HID.HID(path);
		scanner.on("data", (dataBuffer) => {
			try {
				const scanData = dataBuffer.toString("utf8");
				const onecardData = parseScanData(scanData);
				callback(null, onecardData);
			} catch (error) {
				callback(error);
			}
		});
		scanner.on("error", (error) => {
			console.error("HID device error:", error.message);
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
		});
	} catch (error) {
		callback(error);
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
	getSymbolScanner,
	startListeningToScanner,
	closeScanner,
};
