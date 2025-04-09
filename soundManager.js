const fs = require('node:fs');
const path = require('node:path');
const wav = require('wav');
const Speaker = require('speaker');
const configManager = require('./configManager');

class SoundManager {
    constructor() {
        this.successBuffer = null;
        this.errorBuffer = null;
        this.loadSounds();
    }

    loadSounds() {
        try {
            // Load success sound
            const successFile = fs.createReadStream(path.join(__dirname, 'sounds', 'success.mp3'));
            const successReader = new wav.Reader();
            successReader.on('format', (format) => {
                this.successBuffer = {
                    format,
                    data: []
                };
            });
            successReader.on('data', (data) => {
                this.successBuffer.data.push(data);
            });
            successFile.pipe(successReader);

            // Load error sound
            const errorFile = fs.createReadStream(path.join(__dirname, 'sounds', 'error.mp3'));
            const errorReader = new wav.Reader();
            errorReader.on('format', (format) => {
                this.errorBuffer = {
                    format,
                    data: []
                };
            });
            errorReader.on('data', (data) => {
                this.errorBuffer.data.push(data);
            });
            errorFile.pipe(errorReader);
        } catch (err) {
            console.error('Error loading sound files:', err);
        }
    }

    playSound(buffer) {
        if (!buffer || !buffer.format || !buffer.data.length) {
            console.error('Sound buffer not loaded');
            return;
        }

        const speaker = new Speaker(buffer.format);
        buffer.data.forEach(chunk => {
            speaker.write(chunk);
        });
        speaker.end();
    }

    playSuccess() {
        if (configManager.getSoundEnabled() && this.successBuffer) {
            this.playSound(this.successBuffer);
        }
    }

    playError() {
        if (configManager.getSoundEnabled() && this.errorBuffer) {
            this.playSound(this.errorBuffer);
        }
    }
}

module.exports = new SoundManager(); 