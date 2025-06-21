const GuestEntry = require("../lib/standalone/GuestEntry");
const { submitEntry } = require("../lib/server/entries");
const windowManager = require("../windowManager");
const soundManager = require("../soundManager");
const configManager = require("../configManager");

exports.onSwipe = async (error, onecardData) => {
  if (error) {
    console.error("Error during swipe:", error.message);
    windowManager.getMainWindow().webContents.send(
      "swipe-error",
      `Swipe error: ${error.message}`
    );
    return soundManager.playError();
  }

  const { onecard, name } = onecardData;
  try {
    await GuestEntry.create(onecard, name);
    windowManager.getMainWindow().webContents.send("guest-entry", { onecard, name });
    if (configManager.getDeploymentType() === "client-server") {
      await submitEntry(onecard, name);
    }
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
