const HID = require("node-hid");
const {
	getMagtekSwiper,
	parseSwipeData,
	closeSwiper,
} = require("./lib/magtekSwiper");
const {
	getScanner,
	parseScanData,
	closeScanner,
} = require("./lib/barcodeScanner");
const reconnectionManager = require("./lib/reconnectionUtility");
const configManager = require("./configManager");

// Helper function to normalize device paths
function normalizePath(path) {
	if (!path) return path;

	// Convert all slashes to forward slashes
	const normalizedPath = path.replace(/\\/g, "/");

	// Normalize the prefix to use forward slashes
	if (normalizedPath.startsWith("//?/")) {
		return normalizedPath;
	}
	if (normalizedPath.startsWith("\\\\?\\")) {
		return `//?/${normalizedPath.substring(4)}`;
	}
	return normalizedPath;
}

class HIDManager {
	constructor() {
		this.currentDevice = null;
		this.deviceType = null; // 'msr' or 'barcode'
		this.callbacks = new Map(); // Use Map to track event listeners
		this.isInitialized = false;
		this.devices = new Map(); // Track multiple devices
		this.initializationPromise = null; // Track ongoing initialization
		this.dataHandler = null; // Track the current data handler
	}

	getDevices() {
		try {
			const devices = HID.devices();
			const filteredDevices = devices.filter(
				(device) =>
					device.vendorId === 2049 ||
					device.manufacturer === "Mag-Tek" ||
					device.manufacturer === "Symbol" ||
					device.product.includes("MSR") ||
					device.product.includes("Swipe") ||
					device.product.includes("Scanner"),
			);

			// Normalize paths in the returned devices
			return filteredDevices.map((device) => ({
				...device,
				path: normalizePath(device.path),
			}));
		} catch (error) {
			console.error("Error getting HID devices:", error);
			return [];
		}
	}

	async initializeDevices() {
		// If initialization is already in progress, return the existing promise
		if (this.initializationPromise) {
			console.log("Initialization already in progress, waiting...");
			return this.initializationPromise;
		}

		// If devices are already initialized, return null
		if (this.isInitialized && this.devices.size > 0) {
			console.log("Devices already initialized, skipping...");
			return null;
		}

		// Create a new initialization promise
		this.initializationPromise = (async () => {
			try {
				const devices = this.getDevices();
				if (devices.length === 0) {
					console.log("No HID devices detected.");
					return null;
				}

				// Check for saved devices first
				const savedMSR = configManager.getSelectedDevice("msr");
				const savedBarcode = configManager.getSelectedDevice("barcode");
				let msrConfigured = false;
				let scannerConfigured = false;

				// Try to use saved devices if they exist and are available
				if (savedMSR || savedBarcode) {
					const savedDevices = devices.filter(
						(device) => device.path === savedMSR || device.path === savedBarcode,
					);

					if (savedDevices.length > 0) {
						console.log("Using saved device configuration...");
						for (const device of savedDevices) {
							const type = device.path === savedMSR ? "msr" : "barcode";
							try {
								await this.setDevice(device.path, type);
								console.log(`Successfully initialized saved ${type} device`);
								if (type === "msr") msrConfigured = true;
								if (type === "barcode") scannerConfigured = true;
							} catch (error) {
								console.error(`Error initializing saved ${type} device:`, error.message);
							}
						}
					}
				}

				// If we've successfully initialized from saved devices, we're done
				if (msrConfigured || scannerConfigured) {
					console.log("Devices initialized from saved configuration");
					return null;
				}

				// Only proceed with auto-configuration if we haven't initialized any devices
				if (devices.length > 1) {
					console.log("Multiple HID devices detected, attempting to auto-configure...");

					// Only try to configure MSR if not already configured
					if (!msrConfigured) {
						try {
							const msrPath = await getMagtekSwiper();
							if (msrPath) {
								await this.setDevice(msrPath, "msr");
								configManager.setSelectedDevice("msr", msrPath);
								console.log("Successfully configured MSR device");
								msrConfigured = true;
							}
						} catch (msrError) {
							console.error("Error configuring MSR device:", msrError.message);
						}
					}

					// Only try to configure scanner if not already configured
					if (!scannerConfigured) {
						try {
							const scannerPath = await getScanner();
							if (scannerPath) {
								await this.setDevice(scannerPath, "barcode");
								configManager.setSelectedDevice("barcode", scannerPath);
								console.log("Successfully configured barcode scanner");
								scannerConfigured = true;
							}
						} catch (scannerError) {
							console.error("Error configuring barcode scanner:", scannerError.message);
						}
					}

					// If either device failed to configure, return the devices for manual selection
					if (!msrConfigured || !scannerConfigured) {
						return devices;
					}
				} else if (devices.length === 1) {
					// Single device - determine type and use it
					const device = devices[0];
					const type = device.manufacturer === "Symbol" ? "barcode" : "msr";
					try {
						console.log(`${type === "msr" ? "MagTek Swiper" : "Symbol Scanner"} detected, starting device...`);
						await this.setDevice(device.path, type);
						configManager.setSelectedDevice(type, device.path);
						if (type === "msr") msrConfigured = true;
						if (type === "barcode") scannerConfigured = true;
					} catch (error) {
						console.error("Error starting device:", error.message);
						return devices;
					}
				}

				return null; // All devices configured successfully
			} catch (error) {
				console.error("Error initializing devices:", error.message);
				return this.getDevices(); // Return available devices for manual selection
			} finally {
				// Clear the initialization promise when done
				this.initializationPromise = null;
			}
		})();

		return this.initializationPromise;
	}

	async setDevice(path, type) {
		// Check if we already have this device initialized
		if (this.devices.has(type) && this.devices.get(type).path === path) {
			return;
		}

		try {
			// Close any existing device of the same type
			await this.closeDevice(type);

			let device;
			if (type === "msr") {
				device = await getMagtekSwiper(path);
				// Remove any existing data handler before setting up a new one
				if (this.dataHandler) {
					device.removeListener('data', this.dataHandler);
				}
				this.dataHandler = (dataBuffer) => {
					try {
						const swipeData = dataBuffer.toString().replace(/\0/g, "").trim();
						if (!swipeData) return;

						const onecardData = parseSwipeData(swipeData);
						this.handleDeviceData(null, onecardData, "msr");
					} catch (error) {
						this.handleDeviceData(error, null, "msr");
					}
				};
				device.on('data', this.dataHandler);
			} else if (type === "barcode") {
				device = await getScanner(path);
				// Remove any existing data handler before setting up a new one
				if (this.dataHandler) {
					device.removeListener('data', this.dataHandler);
				}
				this.dataHandler = (dataBuffer) => {
					try {
						const scanData = dataBuffer.toString().replace(/\0/g, '').trim();
						if (!scanData) return;

						const onecard = parseScanData(scanData);
						this.handleDeviceData(null, onecard, "barcode");
					} catch (error) {
						this.handleDeviceData(error, null, "barcode");
					}
				};
				device.on('data', this.dataHandler);
			}

			if (device) {
				this.devices.set(type, device);
				this.isInitialized = true;
			}
		} catch (error) {
			console.error(`Error setting ${type} device:`, error);
			throw error;
		}
	}

	handleDeviceData(error, data, deviceType) {
		if (error) {
			this.notifyCallbacks("error", error);
			return;
		}

		let processedData = data;
		if (deviceType === 'barcode' && typeof data === 'number') {
			processedData = { onecard: data, name: null };
		} else if (deviceType === 'msr' && typeof data === 'object') {
			processedData = data;
		}

		if (processedData?.onecard) {
			this.notifyCallbacks("data", processedData);
		} else {
			this.notifyCallbacks("error", new Error('Invalid data format received from device'));
		}
	}

	async closeDevice(type) {
		if (!this.devices.has(type)) {
			return;
		}

		try {
			const device = this.devices.get(type);
			if (this.dataHandler) {
				device.removeListener('data', this.dataHandler);
				this.dataHandler = null;
			}

			if (type === "msr") {
				await closeSwiper();
			} else if (type === "barcode") {
				await closeScanner();
			}
			reconnectionManager.resetAttempts();
		} catch (error) {
			console.error(`Error closing ${type} device:`, error);
		} finally {
			this.devices.delete(type);
			if (this.deviceType === type) {
				this.currentDevice = null;
				this.deviceType = null;
				this.isInitialized = false;
			}
		}
	}

	async closeCurrentDevice() {
		if (this.deviceType) {
			await this.closeDevice(this.deviceType);
		}
	}

	on(event, callback) {
		if (!event || typeof callback !== "function") {
			throw new Error("Invalid event or callback");
		}

		// Remove any existing callback for this event
		this.off(event, callback);

		// Add the new callback
		if (!this.callbacks.has(event)) {
			this.callbacks.set(event, new Set());
		}
		this.callbacks.get(event).add(callback);
	}

	off(event, callback) {
		if (!event || typeof callback !== "function") {
			throw new Error("Invalid event or callback");
		}

		if (this.callbacks.has(event)) {
			this.callbacks.get(event).delete(callback);
			if (this.callbacks.get(event).size === 0) {
				this.callbacks.delete(event);
			}
		}
	}

	notifyCallbacks(event, data) {
		if (this.callbacks.has(event)) {
			for (const callback of this.callbacks.get(event)) {
				try {
					callback(data);
				} catch (error) {
					console.error(`Error in callback for event ${event}:`, error);
				}
			}
		}
	}

	async close() {
		// Clear all callbacks
		this.callbacks.clear();

		// Close all devices
		for (const [type, device] of this.devices) {
			await this.closeDevice(type);
		}

		this.devices.clear();
		this.isInitialized = false;
		this.initializationPromise = null;
	}
}

module.exports = new HIDManager();
