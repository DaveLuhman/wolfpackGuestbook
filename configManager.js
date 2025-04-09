const fs = require('node:fs');
const path = require('node:path');

class ConfigManager {
    constructor() {
        this.configPath = path.join(__dirname, "wg_config.json");
        this.config = this.loadConfig();
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
        return this.config.soundEnabled !== false;
    }

    setSoundEnabled(enabled) {
        this.set('soundEnabled', enabled);
    }

    // Password configuration
    getPassword() {
        return this.config.password || "";
    }

    setPassword(password) {
        this.set('password', password);
    }
}

module.exports = new ConfigManager(); 