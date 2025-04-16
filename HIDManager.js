const HID = require("node-hid");
const {
	getMagtekSwiper,
	startListeningToSwiper,
	closeSwiper,
} = require("./lib/magtekSwiper");
const {
	getScanner,
	startListeningToScanner,
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
		this.callbacks = new Set();
		this.isInitialized = false;
		this.devices = new Map(); // Track multiple devices
		this.initializationPromise = null; // Track ongoing initialization
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
			return this.initializationPromise;
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
								console.error(
									`Error initializing saved ${type} device:`,
									error.message,
								);
							}
						}
					}
				}

				// If both devices are configured from saved settings, we're done
				if (msrConfigured && scannerConfigured) {
					console.log("All devices configured from saved settings");
					return null;
				}

				// If no saved devices or they're not available, try auto-configuration
				if (devices.length > 1) {
					console.log(
						"Multiple HID devices detected, attempting to auto-configure...",
					);

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
							console.error(
								"Error configuring barcode scanner:",
								scannerError.message,
							);
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
						console.log(
							`${type === "msr" ? "MagTek Swiper" : "Symbol Scanner"} detected, starting device...`,
						);
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
		if (!path || !type) {
			throw new Error("Device path and type are required");
		}

		// Only close the current device if it's the same type
		if (this.devices.has(type)) {
			await this.closeDevice(type);
		}

		try {
			this.deviceType = type;
			this.currentDevice = path;
			this.devices.set(type, { path, type });

			if (type === "msr") {
				await startListeningToSwiper(path, (error, data) => {
					this.handleDeviceData(error, data, "msr");
				});
			} else if (type === "barcode") {
				await startListeningToScanner(path, (error, data) => {
					this.handleDeviceData(error, data, "barcode");
				});
			} else {
				throw new Error(`Invalid device type: ${type}`);
			}

			this.isInitialized = true;
		} catch (error) {
			this.devices.delete(type);
			this.currentDevice = null;
			this.deviceType = null;
			this.isInitialized = false;
			throw error;
		}
	}

	handleDeviceData(error, data, deviceType) {
		console.log('HIDManager received data:', { error, data, deviceType });

		if (error) {
			console.error('HIDManager error:', error);
			this.notifyCallbacks("error", error);
			return;
		}

		// Ensure data is in the correct format based on device type
		let processedData = null;

		try {
			if (deviceType === 'barcode') {
				// For barcode scanner, data should be a number or numeric string
				if (typeof data === 'number') {
					processedData = { onecard: data, name: null };
				} else if (typeof data === 'string') {
					// Remove any non-numeric characters and convert to number
					const numericValue = parseInt(data.replace(/\D/g, ''), 10);
					if (!isNaN(numericValue)) {
						processedData = { onecard: numericValue, name: null };
					} else {
						throw new Error('Invalid barcode data: non-numeric value');
					}
				} else {
					throw new Error('Invalid barcode data format');
				}
			} else if (deviceType === 'msr') {
				// For MSR, data should be an object with onecard and optional name
				if (typeof data === 'object' && data !== null) {
					if (typeof data.onecard === 'number') {
						processedData = { onecard: data.onecard, name: data.name || null };
					} else if (typeof data.onecard === 'string') {
						// Remove any non-numeric characters and convert to number
						const numericValue = parseInt(data.onecard.replace(/\D/g, ''), 10);
						if (!isNaN(numericValue)) {
							processedData = { onecard: numericValue, name: data.name || null };
						} else {
							throw new Error('Invalid MSR data: non-numeric onecard value');
						}
					} else {
						throw new Error('Invalid MSR data format');
					}
				} else {
					throw new Error('Invalid MSR data: expected object');
				}
			} else {
				throw new Error(`Invalid device type: ${deviceType}`);
			}

			// Validate the processed data
			if (!processedData || typeof processedData.onecard !== 'number' || isNaN(processedData.onecard)) {
				throw new Error('Invalid processed data: missing or invalid onecard number');
			}

			// Ensure name is either a string or null
			if (processedData.name !== null && typeof processedData.name !== 'string') {
				processedData.name = null;
			}

			console.log('Processed device data:', processedData);
			this.notifyCallbacks("data", processedData);
		} catch (error) {
			console.error('Error processing device data:', error);
			this.notifyCallbacks("error", error);
		}
	}

	async closeDevice(type) {
		if (!this.devices.has(type)) {
			return;
		}

		try {
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
