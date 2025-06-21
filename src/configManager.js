const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, ipcMain, app } = require('electron');
const os = require('node:os');
const EventEmitter = require('node:events');


class ConfigManager extends EventEmitter {
    constructor() {
        super();
        try {
            this.configPath = path.join(app.getPath('userData'), 'wg_config.json');
        } catch (e) {
            console.warn('Failed to resolve userData path. Falling back to home directory.');
            this.configPath = path.join(os.homedir(), '.wolfpack-guestbook', 'wg_config.json');
        }

        const fallbackDir = path.dirname(this.configPath);
        if (!fs.existsSync(fallbackDir)) {
            fs.mkdirSync(fallbackDir, { recursive: true, mode: 0o755 });
        }
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
            },
            serverUrl: null,
            missingDevices: {
                swiper: false,
                barcode: false,
            },
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
            },
            missingDevices: {
                ...defaultConfig.missingDevices,
                ...(this.config.missingDevices || {})
            },
            serverUrl: this.config.serverUrl || defaultConfig.serverUrl,
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

    // Kiosk mode configuration
    getKioskMode() {
        return this.config.kiosk.enabled;
    }

    setKioskMode(booleanState) {
        this.config.kiosk.enabled = booleanState;
        this.saveConfig();
    }

    getDeploymentType() {
        return this.config.deploymentType;
    }

    setDeploymentType(deploymentType) {
        this.config.deploymentType = deploymentType;
        const deployementTypes = ['standalone', 'client-server'];
        if (!deployementTypes.includes(deploymentType)) {
            throw new Error('Invalid deployment type');
        }
        this.saveConfig();
    }

    async checkDeploymentType() {
        if (this.config.deploymentType === null) {
            const deploymentType = await this.promptForDeploymentType();
            this.setDeploymentType(deploymentType);
        }
    }
    promptForDeploymentType() {
        return new Promise((resolve) => {
            windowManager.promptForDeploymentType(resolve);
        });
    }

    configExists() {
        return fs.existsSync(this.configPath);
    }

    getServerUrl() {
        return this.config.serverUrl;
    }
    validateServerUrl(serverUrl) {
        // get the first 4 characters of the serverUrl
        const firstFourChars = serverUrl.substring(0, 4);
        if (firstFourChars !== 'http' ) {
            throw new Error('Invalid server URL');
        }
    }
    setServerUrl(serverUrl) {
        this.validateServerUrl(serverUrl);
        this.config.serverUrl = serverUrl;
        this.saveConfig();
    }

    getServerToken() {
        return this.config.serverToken;
    }

    setServerToken(token) {
        this.config.serverToken = token;
        this.saveConfig();
    }

    getDeviceId() {
        return this.config.deviceId;
    }

    setDeviceId(deviceId) {
        this.config.deviceId = deviceId;
        this.saveConfig();
    }

    getDeviceLocation() {
        return this.config.deviceLocation;
    }

    setDeviceLocation(deviceLocation) {
        this.config.deviceLocation = deviceLocation;
        this.saveConfig();
    }

    getDeviceFriendlyName() {
        return this.config.deviceFriendlyName;
    }

    setDeviceFriendlyName(deviceFriendlyName) {
        this.config.deviceFriendlyName = deviceFriendlyName;
        this.saveConfig();
    }

    isSwiperMissing() {
        return this.config.missingDevices?.swiper;
    }

    setSwiperMissing(state) {
        this.config.missingDevices = {
            ...this.config.missingDevices,
            swiper: state,
        };
        this.saveConfig();
    }

    isBarcodeMissing() {
        return this.config.missingDevices?.barcode;
    }

    setBarcodeMissing(state) {
        this.config.missingDevices = {
            ...this.config.missingDevices,
            barcode: state,
        };
        this.saveConfig();
    }
}

module.exports = new ConfigManager();
