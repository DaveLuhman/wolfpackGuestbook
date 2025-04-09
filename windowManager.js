const { BrowserWindow, Menu, nativeImage } = require('electron');
const path = require('node:path');
const configManager = require('./configManager');

class WindowManager {
    constructor() {
        this.mainWindow = null;
        this.viewerWindow = null;
        this.appIcon = nativeImage.createFromPath(
            path.join(__dirname, "img", "favicon-32.png")
        );
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
            title: "Manual Entry"
        });
        manualEntryWindow.setMenu(null);
        manualEntryWindow.loadFile("manualEntry.html");
        manualEntryWindow.on("closed", () => {
            manualEntryWindow = null;
        });
    }

    setupMainMenu() {
        const menuTemplate = [
            {
                label: "File",
                submenu: [
                    {
                        label: "Manual Entry",
                        click: () => { this.createManualEntryWindow(); }
                    },
                    {
                        label: "Mute",
                        click: () => {
                            const currentState = configManager.getSoundEnabled();
                            configManager.setSoundEnabled(!currentState);
                        },
                        type: 'checkbox',
                        checked: configManager.getSoundEnabled()
                    },
                    { role: "quit" }
                ]
            }
        ];
        const menu = Menu.buildFromTemplate(menuTemplate);
        Menu.setApplicationMenu(menu);
    }

    getMainWindow() {
        return this.mainWindow;
    }

    getViewerWindow() {
        return this.viewerWindow;
    }
}

module.exports = new WindowManager();