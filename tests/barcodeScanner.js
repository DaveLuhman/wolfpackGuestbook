const HID = require("node-hid");

// Find the barcode scanner device
function findBarcodeScanner() {
	const devices = HID.devices();
	const scanner = devices.find(
		(device) =>
			device.vendorId === 1504 && // Symbol/Zebra vendor ID
			(device.manufacturer?.includes("Symbol") ||
				device.product?.includes("Bar Code Scanner")),
	);

	if (!scanner) {
		throw new Error("No compatible barcode scanner found");
	}

	return scanner;
}

try {
	// Find and open the scanner
	const scannerDevice = findBarcodeScanner();
	console.log(
		"Found scanner:",
		scannerDevice.manufacturer,
		scannerDevice.product,
	);

	const scanner = new HID.HID(scannerDevice.path);

	// Handle data events
	scanner.on("data", (data) => {
		// Convert buffer to string and clean it up
		const scanData = data.toString().replace(/\0/g, "").trim();
		if (scanData) {
			console.log("Scanned:", scanData);
		}
	});

	// Handle errors
	scanner.on("error", (error) => {
		console.error("Scanner error:", error);
		process.exit(1);
	});

	console.log("Listening for barcode scans...");

	// Cleanup on exit
	process.on("SIGINT", () => {
		console.log("Closing scanner connection...");
		scanner.close();
		process.exit();
	});
} catch (error) {
	console.error("Error:", error.message);
	process.exit(1);
}
