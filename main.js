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
const configManager = require('./configManager');
const windowManager = require('./windowManager');
const soundManager = require('./soundManager');

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
		windowManager.getMainWindow().webContents.send("swipe-error", `Swipe error: ${error.message}`);
		soundManager.playError();
		return;
	}

	const { onecard, name } = onecardData;

	try {
		await GuestEntry.create(onecard, name);
		windowManager.getMainWindow().webContents.send("guest-entry", {
			name,
			onecard,
		});
		soundManager.playSuccess();
	} catch (dbError) {
		console.error("Error handling entry:", dbError.message);
		windowManager.getMainWindow().webContents.send(
			"entry-error",
			`Database error: ${dbError.message}`,
		);
		soundManager.playError();
	}
};

async function initializeSwiper() {
	console.log("Looking for Mag-Tek Swiper or other HID devices...");
	let HIDPath = await getMagtekSwiper();
	if (Array.isArray(HIDPath)) {
		console.log(
			"Multiple HID devices detected, sending select-hid event to renderer.",
		);
		windowManager.getMainWindow().webContents.send("select-hid", HIDPath);
		ipcMain.once("hid-selection", async (event, selectedPath) => {
			console.log("HID device selected:", selectedPath);
			HIDPath = selectedPath;
			try {
				windowManager.getMainWindow().setSize(400, 500);
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
		windowManager.getMainWindow().webContents.send("guest-entry", {
			name: "Guest Visitor",
			onecard: null,
			entryTime: new Date().toLocaleDateString(),
		});
		soundManager.playSuccess();
	} catch (error) {
		console.error("Error handling entry:", error.message);
		windowManager.getMainWindow().webContents.send(
			"entry-error",
			`Database error: ${error.message}`,
		);
		soundManager.playError();
	}
};

app.on("ready", async () => {
	windowManager.createMainWindow();
	// Added file menu with Manual Entry and Sound Toggle
	const menuTemplate = [
		{
			label: "File",
			submenu: [
				{ label: "Manual Entry", click: () => { createManualEntryWindow(); } },
				{ 
					label: "Toggle Sounds", 
					click: () => { 
						global.soundEnabled = !global.soundEnabled;
						// Save the setting to config file
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
						config.soundEnabled = global.soundEnabled;
						try {
							fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
						} catch (err) {
							console.error("Error writing wg_config.json:", err.message);
						}
					},
					type: 'checkbox',
					checked: global.soundEnabled
				},
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

	// Load sound setting from config
	const configPath = path.join(__dirname, "wg_config.json");
	if (fs.existsSync(configPath)) {
		try {
			const rawData = fs.readFileSync(configPath);
			const config = JSON.parse(rawData);
			if (typeof config.soundEnabled === 'boolean') {
				global.soundEnabled = config.soundEnabled;
			}
		} catch (err) {
			console.error("Error reading wg_config.json:", err.message);
		}
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
	const password = configManager.getPassword();
	if (password && password !== "") {
		const entered = await promptForPassword("Viewer Access", "Enter password to view entries:");
		if (entered !== password) {
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

		const csvWriter = createObjectCsvWriter({
			path: filePath,
			header: [
				{ id: "name", title: "Name" },
				{ id: "onecard", title: "Onecard ID" },
				{ id: "entryTime", title: "Date/Time" },
			],
		});

		await csvWriter.writeRecords(entries);
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
	configManager.setPassword(enteredPwd || "");
});

// Added IPC handler for manual entry submission
ipcMain.on("manual-entry-submit", async (event, data) => {
	const entryTime = new Date().toLocaleString();
	try {
		await GuestEntry.create(data.onecard, data.name);
		event.reply("manual-entry-success");
		windowManager.getMainWindow().webContents.send("guest-entry", { name: data.name, onecard: data.onecard, entryTime: entryTime });
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
	if (!windowManager.getMainWindow()) {
		windowManager.createMainWindow();
	}
});
