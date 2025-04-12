const HID = require("node-hid");
const {
	getMagtekSwiper,
	startListeningToSwiper,
	closeSwiper,
} = require("./lib/magtekSwiper");
const {
	getBarcodeScanner,
	startListeningToScanner,
	closeScanner,
} = require("./lib/barcodeScanner");
const reconnectionManager = require("./lib/reconnectionUtility");

class HIDManager {
	constructor() {
		this.currentDevice = null;
		this.deviceType = null; // 'msr' or 'barcode'
		this.callbacks = new Set();
		this.isInitialized = false;
	}

	getDevices() {
		try {
			const devices = HID.devices();
			return devices.filter(
				(device) =>
					device.vendorId === 2049 ||
					device.manufacturer === "Mag-Tek" ||
					device.manufacturer === "Symbol" ||
					device.product.includes("MSR") ||
					device.product.includes("Swipe") ||
					device.product.includes("Scanner"),
			);
		} catch (error) {
			console.error("Error getting HID devices:", error);
			return [];
		}
	}

	async setDevice(path, type) {
		if (!path || !type) {
			throw new Error("Device path and type are required");
		}

		if (this.currentDevice) {
			await this.closeCurrentDevice();
		}

		try {
			this.deviceType = type;
			this.currentDevice = path;

			if (type === "msr") {
				await startListeningToSwiper(path, (error, data) => {
					this.handleDeviceData(error, data);
				});
			} else if (type === "barcode") {
				await startListeningToScanner(path, (error, data) => {
					this.handleDeviceData(error, data);
				});
			} else {
				throw new Error(`Invalid device type: ${type}`);
			}

			this.isInitialized = true;
		} catch (error) {
			this.currentDevice = null;
			this.deviceType = null;
			this.isInitialized = false;
			throw error;
		}
	}

	handleDeviceData(error, data) {
		if (error) {
			this.notifyCallbacks("error", error);
		} else {
			this.notifyCallbacks("data", data);
		}
	}

	async closeCurrentDevice() {
		if (!this.currentDevice) {
			return;
		}

		try {
			if (this.deviceType === "msr") {
				await closeSwiper();
			} else if (this.deviceType === "barcode") {
				await closeScanner();
			}
			reconnectionManager.resetAttempts();
		} catch (error) {
			console.error("Error closing device:", error);
		} finally {
			this.currentDevice = null;
			this.deviceType = null;
			this.isInitialized = false;
		}
	}

	on(event, callback) {
		if (!event || typeof callback !== "function") {
			throw new Error("Invalid event or callback");
		}
		this.callbacks.add({ event, callback });
	}

	off(event, callback) {
		if (!event || typeof callback !== "function") {
			throw new Error("Invalid event or callback");
		}
		for (const cb of this.callbacks) {
			if (cb.event === event && cb.callback === callback) {
				this.callbacks.delete(cb);
				break;
			}
		}
	}

	notifyCallbacks(event, data) {
		for (const cb of this.callbacks) {
			if (cb.event === event) {
				try {
					cb.callback(data);
				} catch (error) {
					console.error(`Error in callback for event ${event}:`, error);
				}
			}
		}
	}

	async close() {
		await this.closeCurrentDevice();
		this.callbacks.clear();
	}
}

module.exports = new HIDManager();
