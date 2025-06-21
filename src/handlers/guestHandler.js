const GuestEntry = require("../lib/standalone/GuestEntry");
const windowManager = require("../windowManager");
const soundManager = require("../soundManager");
let debounceTimeout;
const DEBOUNCE_TIME = 1500; // milliseconds

exports.guestButtonPress = async () => {
  if (debounceTimeout) return;
  debounceTimeout = setTimeout(() => (debounceTimeout = null), DEBOUNCE_TIME);
  try {
    await GuestEntry.createAnonymousEntry();
    windowManager.getMainWindow().webContents.send("guest-entry", { name: "Guest Visitor" });
    soundManager.playSuccess();
  } catch (dbError) {
    console.error("Error handling entry:", dbError.message);
    windowManager.getMainWindow().webContents.send(
      "entry-error",
      `Database error: ${dbError.message}`
    );
    soundManager.playError();
  }
};
