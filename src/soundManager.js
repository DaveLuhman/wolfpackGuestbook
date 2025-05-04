const fs = require('node:fs');
const path = require('node:path');
const wav = require('wav');
const { spawn } = require('node:child_process');
const configManager = require('./configManager');

// Only require speaker on Windows
let Speaker = null;
if (process.platform === 'win32') {
    try {
        Speaker = require('speaker');
    } catch (err) {
        console.error("Failed to load 'speaker':", err.message);
    }
}

class SoundManager {
    constructor() {
        this.successPath = path.join(__dirname, '..', 'public', 'sounds', 'success.wav');
        this.errorPath = path.join(__dirname, '..', 'public', 'sounds', 'error.wav');

        this.successBuffer = null;
        this.errorBuffer = null;

        if (process.platform === 'win32' && Speaker) {
            this.loadSounds();
        }
    }

    loadSounds() {
        try {
            // Success
            const successFile = fs.createReadStream(this.successPath);
            const successReader = new wav.Reader();
            successReader.on('format', (format) => {
                this.successBuffer = { format, data: [] };
            });
            successReader.on('data', (data) => {
                this.successBuffer.data.push(data);
            });
            successFile.pipe(successReader);

            // Error
            const errorFile = fs.createReadStream(this.errorPath);
            const errorReader = new wav.Reader();
            errorReader.on('format', (format) => {
                this.errorBuffer = { format, data: [] };
            });
            errorReader.on('data', (data) => {
                this.errorBuffer.data.push(data);
            });
            errorFile.pipe(errorReader);
        } catch (err) {
            console.error('Error loading sound files:', err);
        }
    }

    playSound(buffer, fallbackPath) {
        if (process.platform === 'win32' && Speaker && buffer?.format && buffer.data.length) {
            const speaker = new Speaker(buffer.format);
            for (const chunk of buffer.data) {
                speaker.write(chunk);
            }
            speaker.end();
        } else {
            this.spawnNativePlayer(fallbackPath);
        }
    }

    spawnNativePlayer(soundPath) {
        let command;
        let args;

        switch (process.platform) {
            case 'darwin':
                command = 'afplay';
                args = [soundPath];
                break;
            case 'linux':
                command = 'aplay';
                args = [soundPath];
                break;
            default:
                console.warn("No native playback available for platform:", process.platform);
                return;
        }

        const player = spawn(command, args);
        player.on('error', (err) => {
            console.error("Error playing sound:", err.message);
        });
    }

    playSuccess() {
        if (configManager.getSoundEnabled()) {
            this.playSound(this.successBuffer, this.successPath);
        }
    }

    playError() {
        if (configManager.getSoundEnabled()) {
            this.playSound(this.errorBuffer, this.errorPath);
        }
    }
}

module.exports = new SoundManager();
