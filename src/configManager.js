const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, ipcMain, app } = require('electron');
const os = require('os');
const EventEmitter = require('events');

class ConfigManager extends EventEmitter {
    constructor() {
        super();
        this.configPath = path.join(app.getPath('userData'), "wg_config.json");
        this.config = this.loadConfig();
        this.initializeConfig();
    }

    initializeConfig() {
        const isARM64 = os.arch() === 'arm64';
        const isDarwin = process.platform === 'darwin';
        
        const defaultConfig = {
            sound: {
                enabled: true
            },
            password: null,
            kiosk: {
                enabled: isARM64 && !isDarwin // Enable by default only on ARM64 non-Mac devices
            }
        };

        // Merge default config with existing config, preserving any existing values
        this.config = {
            ...defaultConfig,
            ...this.config,
            sound: {
                ...defaultConfig.sound,
                ...(this.config.sound || {})
            },
            kiosk: {
                ...defaultConfig.kiosk,
                ...(this.config.kiosk || {})
            }
        };

        // Save the merged config
        this.saveConfig();
    }

    loadConfig() {
        let config = {};
        if (fs.existsSync(this.configPath)) {
            try {
                const rawData = fs.readFileSync(this.configPath);
                config = JSON.parse(rawData);
            } catch (err) {
                console.error("Error reading wg_config.json:", err.message);
            }
        }
        return config;
    }

    saveConfig() {
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
            this.emit('configChanged');
        } catch (err) {
            console.error("Error writing wg_config.json:", err.message);
        }
    }

    get(key) {
        return this.config[key];
    }

    set(key, value) {
        this.config[key] = value;
        this.saveConfig();
    }

    // Sound configuration
    getSoundEnabled() {
        return this.config.sound.enabled;
    }

    setSoundEnabled(enabled) {
        this.config.sound.enabled = enabled;
        this.saveConfig();
    }

    // Password configuration
    getPassword() {
        return this.config.password || "";
    }

    setPassword(password) {
        this.config.password = password;
        this.saveConfig();
    }

    async checkPasswordConfig() {
        if (!this.config.password && this.config.password !== "") {
            const password = await this.promptForPassword();
            this.setPassword(password || "");
        }
    }

    promptForPassword() {
        return new Promise((resolve, _reject) => {
            const channelId = `password-prompt-response-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const promptWindow = new BrowserWindow({
                width: 300,
                height: 250,
                title: "Configure Viewer Password",
                parent: require('./windowManager').getMainWindow(),
                modal: true,
                show: false,
                webPreferences: {
                    preload: path.join(__dirname, 'promptPreload.js'),
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true
                }
            });

            // Read the CSS file and inline its contents
            const styleContent = fs.readFileSync(path.join(__dirname, '../public/styles.css'), 'utf-8');

            const htmlContent = `<!DOCTYPE html>
<html>
    <head>
        <meta name="response-channel" content="${channelId}">
        <title>Configure Viewer Password</title>
        <style>${styleContent}</style>
    </head>
    <body>
        <p class="prompt-message">Enter a password for the viewer window. Leave blank for no password:</p>
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

    // Kiosk mode configuration
    getKioskMode() {
        return this.config.kiosk.enabled;
    }

    setKioskMode(booleanState) {
        this.config.kiosk.enabled = booleanState;
        this.saveConfig();
    }
}

module.exports = new ConfigManager();