const path = require('node:path');
const player = require('play-sound')(); // no platform branching
const configManager = require('./configManager');

class SoundManager {
  constructor() {
    this.sounds = {
      success: path.join(__dirname, '..', 'public', 'sounds', 'success.wav'),
      error:   path.join(__dirname, '..', 'public', 'sounds',   'error.wav'),
    };
  }

  _play(filePath) {
    player.play(filePath, (err) => {
      if (err) console.error('Playback failed:', err);
    });
  }

  playSuccess() {
    if (configManager.getSoundEnabled()) {
      this._play(this.sounds.success);
    }
  }

  playError() {
    if (configManager.getSoundEnabled()) {
      this._play(this.sounds.error);
    }
  }
}

module.exports = new SoundManager();
