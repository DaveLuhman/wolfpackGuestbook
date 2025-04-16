const {
	BrowserWindow,
	Menu,
	nativeImage,
	ipcMain,
	dialog,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const configManager = require("./configManager");
const GuestEntry = require("./GuestEntry");
const { createObjectCsvWriter } = require("csv-writer");

class WindowManager {
	constructor() {
		this.mainWindow = null;
		this.viewerWindow = null;
		this.appIcon = nativeImage.createFromPath(
			path.join(__dirname, "img", "favicon-32.png"),
		);
		this.setupIPC();
	}

	setupIPC() {
		// Handle viewer window opening
		ipcMain.on("open-viewer-window", async () => {
			const password = configManager.getPassword();
			if (password && password !== "") {
				const entered = await this.promptForPassword(
					"Viewer Access",
					"Enter password to view entries:",
				);
				if (entered !== password) {
					dialog.showErrorBox("Access Denied", "Incorrect password!");
					return;
				}
			}
			if (!this.viewerWindow) {
				this.createViewerWindow();
			}
		});

		// Handle device selection save
		ipcMain.on("save-device", (event, devices) => {
			configManager.setSelectedDevice("msr", devices.msr);
			configManager.setSelectedDevice("barcode", devices.barcode);
		});

		// Handle show HID bindings modal
		ipcMain.on("show-hid-bindings", () => {
			if (this.mainWindow) {
				this.mainWindow.webContents.send("show-hid-bindings");
			}
		});

		// Handle manual entry submission
		ipcMain.on("manual-entry-submit", async (event, data) => {
			const entryTime = new Date().toLocaleString();
			try {
				await GuestEntry.create(data.onecard, data.name);
				event.reply("manual-entry-success");
				this.mainWindow.webContents.send("guest-entry", {
					name: data.name,
					onecard: data.onecard,
					entryTime: entryTime,
				});
			} catch (error) {
				event.reply("manual-entry-error", error.message);
			}
		});

		// Handle entry loading in viewer
		ipcMain.on("request-entries", async (event) => {
			try {
				const entries = await GuestEntry.getAllEntries();
				event.sender.send("load-entries", entries);
			} catch (err) {
				console.error("Error loading entries:", err.message);
			}
		});

		// Handle CSV export
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

				if (canceled) {
					return;
				}

				// Format entries for CSV
				const formattedEntries = entries.map(entry => {
					const date = new Date(entry.entryTime);
					const formattedDate = date.toLocaleString('en-US', {
						month: '2-digit',
						day: '2-digit',
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit',
						second: '2-digit',
						hour12: true
					}).replace(',', '');

					return {
						dateTime: formattedDate,
						onecard: entry.onecard,
						name: entry.name || "N/A"
					};
				});

				const csvWriter = createObjectCsvWriter({
					path: filePath,
					header: [
						{ id: "dateTime", title: "Date & Time" },
						{ id: "onecard", title: "ID #" },
						{ id: "name", title: "Last Name/First Name  MI" }
					],
				});

				await csvWriter.writeRecords(formattedEntries);
				console.log("CSV file written successfully");
			} catch (error) {
				console.error("Error exporting CSV:", error.message);
			}
		});

		// Handle data flush
		ipcMain.on("flush-data", async (event) => {
			try {
				await GuestEntry.flush();
				event.sender.send("load-entries", []);
				console.log("All entry data flushed");
			} catch (error) {
				console.error("Error flushing data:", error.message);
			}
		});

		// Handle password change
		ipcMain.on("set-password", async (event, newPassword) => {
			configManager.setPassword(newPassword || "");
		});
	}

	createMainWindow() {
		this.mainWindow = new BrowserWindow({
			width: 400,
			height: 600,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false,
			},
			title: "Guestbook",
			icon: path.join(__dirname, "img", "favicon.ico"),
		});

		this.mainWindow.setIcon(this.appIcon);
		this.mainWindow.loadFile("index.html");
		this.mainWindow.on("closed", () => {
			this.mainWindow = null;
		});

		this.setupMainMenu();
		this.mainWindow.webContents.openDevTools();
	}

	createViewerWindow() {
		this.viewerWindow = new BrowserWindow({
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

		this.viewerWindow.setIcon(this.appIcon);
		this.viewerWindow.loadFile("viewer.html");
		this.viewerWindow.on("closed", () => {
			this.viewerWindow = null;
		});
	}

	createManualEntryWindow() {
		let manualEntryWindow = new BrowserWindow({
			width: 400,
			height: 300,
			parent: this.mainWindow,
			modal: true,
			resizable: false,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false,
			},
			title: "Manual Entry",
		});
		manualEntryWindow.setMenu(null);
		manualEntryWindow.loadFile("manualEntry.html");
		manualEntryWindow.on("closed", () => {
			manualEntryWindow = null;
		});
	}

	createHIDBindingsWindow() {
		let hidBindingsWindow = new BrowserWindow({
			width: 500,
			height: 400,
			parent: this.mainWindow,
			modal: true,
			resizable: false,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false,
			},
			title: "HID Bindings",
		});
		hidBindingsWindow.setMenu(null);
		hidBindingsWindow.loadFile("hidBindings.html");
		hidBindingsWindow.on("closed", () => {
			hidBindingsWindow = null;
		});
	}

	setupMainMenu() {
		const menuTemplate = [
			{
				label: "File",
				submenu: [
					{
						label: "Manual Entry",
						click: () => {
							this.createManualEntryWindow();
						},
					},
					{ role: "quit" },
				],
			},
			{
				label: "Settings",
				submenu: [
					{
						label: configManager.getSoundEnabled() ? "Mute" : "Unmute",
						click: () => {
							const currentState = configManager.getSoundEnabled();
							configManager.setSoundEnabled(!currentState);
							this.updateSoundMenuLabel();
						},
						type: "checkbox",
						checked: !configManager.getSoundEnabled(),
					},
					{
						label: "HID Bindings",
						click: () => {
							if (this.mainWindow) {
								this.mainWindow.webContents.send("show-hid-bindings");
							}
						},
					},
				],
			},
		];
		const menu = Menu.buildFromTemplate(menuTemplate);
		Menu.setApplicationMenu(menu);
	}

	updateSoundMenuLabel() {
		const menu = Menu.getApplicationMenu();
		const soundMenuItem = menu.items[0].submenu.items[1];
		soundMenuItem.label = configManager.getSoundEnabled() ? "Mute" : "Unmute";
		soundMenuItem.checked = !configManager.getSoundEnabled();
		Menu.setApplicationMenu(menu);
	}

	getMainWindow() {
		return this.mainWindow;
	}

	getViewerWindow() {
		return this.viewerWindow;
	}

	promptForPassword(title, message) {
		return new Promise((resolve, _reject) => {
			const channelId = `password-prompt-response-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
			const promptWindow = new BrowserWindow({
				width: 300,
				height: 250,
				title: title,
				parent: this.mainWindow,
				modal: true,
				show: false,
				webPreferences: {
					preload: path.join(__dirname, "promptPreload.js"),
					nodeIntegration: false,
					contextIsolation: true,
					webSecurity: true,
					enableRemoteModule: false,
					sandbox: true
				},
			});

			// Read the CSS file and inline its contents
			const styleContent = fs.readFileSync(
				path.join(__dirname, "styles.css"),
				"utf-8",
			);

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

			promptWindow.loadURL(
				`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
			);
			promptWindow.once("ready-to-show", () => {
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
}

module.exports = new WindowManager();
