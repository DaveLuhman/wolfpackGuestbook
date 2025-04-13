const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const configManager = require("./configManager");

class SoundManager {
	constructor() {
		this.successPath = path.join(__dirname, "sounds", "success.wav");
		this.errorPath = path.join(__dirname, "sounds", "error.wav");
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

	playSound(soundPath) {
		if (!fs.existsSync(soundPath)) {
			console.error("Sound file not found:", soundPath);
			return;
		}

		try {
			// Use aplay on Linux, afplay on macOS, or powershell on Windows
			let command;
			let args;
			switch (process.platform) {
				case "win32":
					// Use a more reliable method for Windows
					command = "powershell";
					args = [
						"-NoProfile",
						"-ExecutionPolicy", "Bypass",
						"-Command",
						`$Sound = New-Object System.Media.SoundPlayer; $Sound.SoundLocation = '${soundPath}'; $Sound.PlaySync();`
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
			});

			player.on("close", (code) => {
				if (code !== 0) {
					console.error(`Sound player exited with code ${code}`);
				}
			});

			// Add a timeout to prevent hanging
			setTimeout(() => {
				if (!player.killed) {
					player.kill();
					console.error("Sound playback timed out");
				}
			}, 5000);
		} catch (err) {
			console.error("Error playing sound:", err);
		}
	}

	playSuccess() {
		console.log("Attempting to play success sound. Sound enabled:", configManager.getSoundEnabled());
		if (configManager.getSoundEnabled()) {
			this.playSound(this.successPath);
		} else {
			console.log("Success sound not played - sound disabled");
		}
	}

	playError() {
		console.log("Attempting to play error sound. Sound enabled:", configManager.getSoundEnabled());
		if (configManager.getSoundEnabled()) {
			this.playSound(this.errorPath);
		} else {
			console.log("Error sound not played - sound disabled");
		}
	}
}

module.exports = new SoundManager();
