const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const configManager = require("./configManager");

class SoundManager {
	constructor() {
		this.successPath = path.join(__dirname, "sounds", "success.wav");
		this.errorPath = path.join(__dirname, "sounds", "error.wav");
		this.soundQueue = [];
		this.isPlaying = false;
		this.verifySoundFiles();
	}

	verifySoundFiles() {
		if (!fs.existsSync(this.successPath)) {
			console.error("Success sound file not found:", this.successPath);
		}
		if (!fs.existsSync(this.errorPath)) {
			console.error("Error sound file not found:", this.errorPath);
		}
	}

	async playSound(soundPath) {
		if (!fs.existsSync(soundPath)) {
			console.error("Sound file not found:", soundPath);
			return;
		}

		// Add sound to queue
		this.soundQueue.push(soundPath);

		// If we're already playing, let the current sound finish
		if (this.isPlaying) {
			return;
		}

		await this.processQueue();
	}

	async processQueue() {
		if (this.soundQueue.length === 0) {
			this.isPlaying = false;
			return;
		}

		this.isPlaying = true;
		const soundPath = this.soundQueue.shift();

		try {
			// Use aplay on Linux, afplay on macOS, or powershell on Windows
			let command;
			let args;
			switch (process.platform) {
				case "win32":
					// Use non-blocking Play() instead of PlaySync()
					command = "powershell";
					args = [
						"-NoProfile",
						"-ExecutionPolicy", "Bypass",
						"-Command",
						`$Sound = New-Object System.Media.SoundPlayer; $Sound.SoundLocation = '${soundPath}'; $Sound.Play();`
					];
					break;
				case "darwin":
					command = "afplay";
					args = [soundPath];
					break;
				default:
					command = "aplay";
					args = [soundPath];
			}

			const player = spawn(command, args);

			player.on("error", (err) => {
				console.error("Error playing sound:", err);
				this.isPlaying = false;
				this.processQueue();
			});

			player.on("close", (code) => {
				if (code !== 0) {
					console.error(`Sound player exited with code ${code}`);
				}
				this.isPlaying = false;
				this.processQueue();
			});

			// Add a timeout to prevent hanging
			const timeout = setTimeout(() => {
				if (!player.killed) {
					player.kill();
					console.error("Sound playback timed out");
					this.isPlaying = false;
					this.processQueue();
				}
			}, 2000);

			// Clean up timeout when player exits
			player.on("exit", () => {
				clearTimeout(timeout);
			});

		} catch (err) {
			console.error("Error playing sound:", err);
			this.isPlaying = false;
			this.processQueue();
		}
	}

	playSuccess() {
		if (configManager.getSoundEnabled()) {
			console.log("Attempting to play success sound. Sound enabled: true");
			this.playSound(this.successPath);
		}
	}

	playError() {
		if (configManager.getSoundEnabled()) {
			console.log("Attempting to play error sound. Sound enabled: true");
			this.playSound(this.errorPath);
		}
	}
}

module.exports = new SoundManager();
