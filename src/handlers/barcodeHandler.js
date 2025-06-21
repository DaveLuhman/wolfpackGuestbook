const GuestEntry = require("../lib/standalone/GuestEntry");
const windowManager = require("../windowManager");
const soundManager = require("../soundManager");

exports.onBarcodeScan = async (error, barcodeData) => {
  if (error) {
    console.error("Error during barcode scan:", error.message);
    windowManager.getMainWindow().webContents.send(
      "scan-error",
      `Barcode scan error: ${error.message}`
    );
    return soundManager.playError();
  }

  const { onecard, name } = barcodeData;
  try {
    await GuestEntry.create(onecard, name);
    windowManager.getMainWindow().webContents.send("guest-entry", {
      name: "Barcode Entry",
      onecard,
    });
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
