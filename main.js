const {
	app,
	BrowserWindow,
	ipcMain,
	nativeImage,
	dialog,
	globalShortcut,
	Menu,
} = require("electron");
const path = require("node:path");
const fs = require('node:fs');
const connectDB = require("./db.js");
const GuestEntry = require("./GuestEntry.js");
const {
	getMagtekSwiper,
	startListeningToSwiper,
	closeSwiper,
} = require("./magtekSwiper.js");
const { createObjectCsvWriter } = require("csv-writer");

let mainWindow;
let viewerWindow;
let viewerPassword = "";

const appIcon = nativeImage.createFromPath(
	path.join(__dirname, "img", "favicon-32.png"),
);

function promptForPassword(title, message) {
	return new Promise((resolve, _reject) => {
		const channelId = `password-prompt-response-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
		const promptWindow = new BrowserWindow({
			width: 300,
			height: 250,
			title: title,
			parent: mainWindow,
			modal: true,
			show: false,
			webPreferences: {
				preload: path.join(__dirname, 'promptPreload.js'),
				nodeIntegration: false,
				contextIsolation: true,
				webSecurity: true
			}
		});

		// Ensure the promptWindow closes if the main window is closed
		if (mainWindow) {
			mainWindow.on('closed', () => {
				if (!promptWindow.isDestroyed()) {
					promptWindow.close();
				}
			});
		}

		// Read the CSS file and inline its contents
		const styleContent = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf-8');

		const htmlContent = `<!DOCTYPE html>
<html>
	<head>
		<meta name="response-channel" content="${channelId}">
		<title>${title}</title>
		<style>${styleContent}</style>
	</head>
	<body>
		<p class="prompt-message">${message}</p>
		<input id="pwd" type="password" autofocus />
		<div class="button-container">
			<button id="submit">Submit</button>
			<button id="cancel">Cancel</button>
		</div>
		<script>
			const responseChannel = "${channelId}";
			document.getElementById('submit').addEventListener('click', () => {
				const value = document.getElementById('pwd').value;
				window.Electron.sendResponse(responseChannel, value);
			});
			document.getElementById('cancel').addEventListener('click', () => {
				window.Electron.sendResponse(responseChannel, null);
			});
			document.addEventListener('keydown', (event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					const value = document.getElementById('pwd').value;
					window.Electron.sendResponse(responseChannel, value);
				} else if (event.key === 'Escape') {
					event.preventDefault();
					window.Electron.sendResponse(responseChannel, null);
				}
			});
		</script>
	</body>
</html>`;

		promptWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);
		promptWindow.once('ready-to-show', () => {
			promptWindow.show();
		});
		ipcMain.once(channelId, (event, value) => {
			resolve(value);
			if (!promptWindow.isDestroyed()) {
				promptWindow.close();
			}
		});
	});
}

async function checkPasswordConfig() {
	const configPath = path.join(__dirname, "wg_config.json");
	let config = {};
	let needsPrompt = false;
	if (fs.existsSync(configPath)) {
		try {
			const rawData = fs.readFileSync(configPath);
			config = JSON.parse(rawData);
		} catch (err) {
			console.error("Error reading wg_config.json:", err.message);
			needsPrompt = true;
		}
		if (!Object.prototype.hasOwnProperty.call(config, "password")) {
			needsPrompt = true;
		}
	} else {
		needsPrompt = true;
	}
	if (needsPrompt) {
		const enteredPwd = await promptForPassword("Configure Viewer Password", "Enter a password for the viewer window. Leave blank for no password:");
		config.password = enteredPwd || "";
		viewerPassword = config.password;
		try {
			fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
			console.log("wg_config.json created/updated with password");
		} catch (err) {
			console.error("Error writing wg_config.json:", err.message);
		}
	} else {
		viewerPassword = config.password;
	}
}

function createMainWindow() {
	mainWindow = new BrowserWindow({
		width: 400,
		height: 600,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
		title: "Guestbook",
		icon: path.join(__dirname, "img", "favicon.ico"),
	});

	mainWindow.setIcon(appIcon);
	mainWindow.loadFile("index.html");
	mainWindow.on("closed", () => {
		mainWindow = null;
		closeSwiper();
		app.quit(); // Ensure the application exits when the window is closed
	});
}
const onSwipe = async (error, onecardData) => {
	if (error) {
		console.error("Error during swipe:", error.message);
		mainWindow.webContents.send("swipe-error", `Swipe error: ${error.message}`);
		return;
	}

	const { onecard, name } = onecardData;

	try {
		// Simply create a guest entry record
		await GuestEntry.create(onecard, name);
		mainWindow.webContents.send("guest-entry", {
			name,
			onecard,
		});
	} catch (dbError) {
		console.error("Error handling entry:", dbError.message);
		mainWindow.webContents.send(
			"entry-error",
			`Database error: ${dbError.message}`,
		);
	}
};
async function initializeSwiper() {
	console.log("Looking for Mag-Tek Swiper or other HID devices...");
	let HIDPath = await getMagtekSwiper();
	if (Array.isArray(HIDPath)) {
		console.log(
			"Multiple HID devices detected, sending select-hid event to renderer.",
		);
		mainWindow.webContents.send("select-hid", HIDPath);
		ipcMain.once("hid-selection", async (event, selectedPath) => {
			console.log("HID device selected:", selectedPath);
			HIDPath = selectedPath;
			try {
				mainWindow.setSize(400, 500);
				await startListeningToSwiper(HIDPath, onSwipe);
			} catch (error) {
				console.error("Error starting swiper after selection:", error.message);
			}
		});
	} else {
		try {
			console.log("MagTek Swiper detected, starting swiper...");
			await startListeningToSwiper(HIDPath, onSwipe);
		} catch (error) {
			console.error("Error starting swiper:", error.message);
		}
	}
}
let debounceTimeout;
const DEBOUNCE_TIME = 1500; // 1500ms or 1.5 seconds
const guestButtonPressCallback = async () => {
	if (debounceTimeout) {
		console.log("F24 press ignored due to active timeout.");
		return; // Ignore the press if debounce is active
	}

	debounceTimeout = setTimeout(() => {
		debounceTimeout = null; // Reset the timeout after the period
	}, DEBOUNCE_TIME);
	try {
		await GuestEntry.createAnonymousEntry();
		mainWindow.webContents.send("guest-entry", {
			name: "Guest Visitor",
			onecard: null,
			entryTime: new Date().toLocaleDateString(),
		});
	} catch (error) {
		console.error("Error handling entry:", error.message);
		mainWindow.webContents.send(
			"entry-error",
			`Database error: ${error.message}`,
		);
	}
};
app.on("ready", async () => {
	createMainWindow();
	// Added file menu with Manual Entry
	const menuTemplate = [
		{
			label: "File",
			submenu: [
				{ label: "Manual Entry", click: () => { createManualEntryWindow(); } },
				{ role: "quit" }
			]
		}
	];
	const menu = Menu.buildFromTemplate(menuTemplate);
	Menu.setApplicationMenu(menu);

	try {
		await connectDB;
		console.log("Database connected successfully.");
	} catch (err) {
		console.error("Failed to connect to the database:", err.message);
		app.quit();
	}

	await checkPasswordConfig();

	globalShortcut.register("F24", guestButtonPressCallback);

	console.log("Looking for Mag-Tek Swiper or other HID devices...");
	initializeSwiper();
	ipcMain.on("reload-swiper", initializeSwiper);
});

function createViewerWindow() {
	viewerWindow = new BrowserWindow({
		width: 800,
		height: 600,
		alwaysOnTop: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
		title: "Guestbook Viewer",
		icon: path.join(__dirname, "img", "favicon-32.png"),
	});

	viewerWindow.setIcon(appIcon);
	viewerWindow.loadFile("viewer.html");
	viewerWindow.on("closed", () => {
		viewerWindow = null;
	});
}

function createManualEntryWindow() {
	let manualEntryWindow = new BrowserWindow({
		width: 400,
		height: 300,
		parent: mainWindow,
		modal: true,
		resizable: false,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
		title: "Manual Entry"
	});
	manualEntryWindow.setMenu(null);
	manualEntryWindow.loadFile("manualEntry.html");
	manualEntryWindow.on("closed", () => {
		manualEntryWindow = null;
	});
}

// open viewer window when logo on main window is clicked
ipcMain.on("open-viewer-window", async () => {
	if (viewerPassword && viewerPassword !== "") {
		const entered = await promptForPassword("Viewer Access", "Enter password to view entries:");
		if (entered !== viewerPassword) {
			dialog.showErrorBox("Access Denied", "Incorrect password!");
			return;
		}
	}
	if (!viewerWindow) {
		createViewerWindow();
	}
});
// frontend requesting entries to fill table
ipcMain.on("request-entries", async (e) => {
	try {
		const entries = await GuestEntry.getAllEntries();
		e.sender.send("load-entries", entries);
	} catch (err) {
		console.log(err.message);
	}
});
ipcMain.on("export-csv", async (event) => {
	try {
		const entries = await GuestEntry.getAllEntries();
		const currentDate = new Date().toISOString().split("T")[0];
		const defaultPath = `gb-entries_${currentDate}.csv`;

		const { canceled, filePath } = await dialog.showSaveDialog({
			title: "Save CSV",
			defaultPath: defaultPath,
			filters: [{ name: "CSV Files", extensions: ["csv"] }],
		});

		if (canceled) return;

		// Format entries according to requested format
		const formattedEntries = entries.map(entry => {
			// Format date/time
			const date = new Date(entry.entryTime);
			const formattedDate = date.toLocaleString('en-US', {
				month: '2-digit',
				day: '2-digit',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				second: '2-digit',
				hour12: true
			});

			// Format name (assuming format is "First Last" or "First Middle Last")
			let formattedName = entry.name;
			if (entry.name !== "Anonymous" && entry.name !== "Guest Visitor") {
				const nameParts = entry.name.split(' ');
				if (nameParts.length >= 2) {
					const lastName = nameParts[nameParts.length - 1];
					const firstName = nameParts[0];
					const middleInitial = nameParts.length > 2 ? nameParts[1].charAt(0) : '';
					formattedName = `${lastName}/${firstName} ${middleInitial}`.trim();
				}
			}

			return {
				'Date & Time': formattedDate,
				'ID #': entry.onecard || '',
				'Last Name/First Name  MI': entry.name
			};
		});

		const csvWriter = createObjectCsvWriter({
			path: filePath,
			header: [
				{ id: 'Date & Time', title: 'Date & Time' },
				{ id: 'ID #', title: 'ID #' },
				{ id: 'Last Name/First Name  MI', title: 'Last Name/First Name  MI' }
			]
		});

		await csvWriter.writeRecords(formattedEntries);
		console.log("CSV file written successfully");
	} catch (error) {
		console.error("Error exporting CSV:", error.message);
	}
});

ipcMain.on("flush-data", async (event) => {
	const result = await dialog.showMessageBox({
		type: "warning",
		buttons: ["Cancel", "Flush Data"],
		defaultId: 0,
		title: "Confirm Data Flush",
		message:
			"Are you sure you want to flush all the data? This action cannot be undone.",
	});

	if (result.response === 1) {
		try {
			await GuestEntry.flush();
			event.sender.send("load-entries", []);
			console.log("All entry data flushed");
		} catch (error) {
			console.error("Error flushing data:", error.message);
		}
	}
});

ipcMain.on("set-password", async () => {
	const enteredPwd = await promptForPassword("Set/Change Password", "Enter a new password for the viewer window. Leave blank for no password:");
	const configPath = path.join(__dirname, "wg_config.json");
	let config = {};

	if (fs.existsSync(configPath)) {
		try {
			const rawData = fs.readFileSync(configPath);
			config = JSON.parse(rawData);
		} catch (err) {
			console.error("Error reading wg_config.json:", err.message);
		}
	}

	config.password = enteredPwd || "";
	viewerPassword = config.password;

	try {
		fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
		console.log("wg_config.json updated with new password");
	} catch (err) {
		console.error("Error writing wg_config.json:", err.message);
	}
});

// Added IPC handler for manual entry submission
ipcMain.on("manual-entry-submit", async (event, data) => {
	const entryTime = new Date().toLocaleString();
	try {
		await GuestEntry.create(data.onecard, data.name);
		event.reply("manual-entry-success");
		mainWindow.webContents.send("guest-entry", { name: data.name, onecard: data.onecard, entryTime: entryTime });
	} catch (error) {
		event.reply("manual-entry-error", error.message);
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		globalShortcut.unregisterAll();
		app.quit();
	}
});

app.on("activate", () => {
	if (mainWindow === null) {
		createMainWindow();
	}
});
