const { ipcMain } = require('electron');
const configManager = require('./configManager');
const windowManager = require('./windowManager');
const { CronJob } = require('cron');
const { deviceHeartbeat, registerThisDevice } = require('./lib/server/devices');
const { onSwipe } = require('./handlers/swipeHandler');
const { onBarcodeScan } = require('./handlers/barcodeHandler');
const { getMagtekSwiper, startListeningToSwiper, closeSwiper } = require('./magtekSwiper');
const { getBarcodeScanner, startListeningToScanner, closeScanner } = require('./barcodeScanner');

async function initSwiper() {
  if (configManager.isSwiperMissing()) {
    console.log('Swiper marked as missing; skipping initialization.');
    return;
  }
  let HIDPath = getMagtekSwiper();
  if (Array.isArray(HIDPath)) {
    windowManager.getMainWindow().webContents.send('select-swiper-hid', HIDPath);
    ipcMain.once('swiper-hid-selection', async (event, selectedPath) => {
      HIDPath = selectedPath;
      try {
        windowManager.getMainWindow().setSize(400, 500);
        await startListeningToSwiper(HIDPath, onSwipe);
      } catch (error) {
        console.error('Error starting swiper after selection:', error.message);
      }
    });
    ipcMain.once('skip-swiper-selection', () => {
      configManager.setSwiperMissing(true);
    });
  } else {
    try {
      console.log('MagTek Swiper detected, starting swiper...');
      await startListeningToSwiper(HIDPath, onSwipe);
    } catch (error) {
      console.error('Error starting swiper:', error.message);
    }
  }
}

async function initBarcode() {
  if (configManager.isBarcodeMissing()) {
    console.log('Barcode scanner marked as missing; skipping initialization.');
    return;
  }
  console.log('Looking for Barcode Scanner or other HID devices...');
  let HIDPath = getBarcodeScanner();
  if (Array.isArray(HIDPath)) {
    console.log('Multiple HID devices detected, sending select-barcode-hid event to renderer.');
    windowManager.getMainWindow().webContents.send('select-barcode-hid', HIDPath);
    ipcMain.once('barcode-hid-selection', async (event, selectedPath) => {
      console.log('Barcode HID device selected:', selectedPath);
      HIDPath = selectedPath;
      try {
        windowManager.getMainWindow().setSize(400, 500);
        await startListeningToScanner(HIDPath, onBarcodeScan);
      } catch (error) {
        console.error('Error starting barcode scanner after selection:', error.message);
      }
    });
    ipcMain.once('skip-barcode-selection', () => {
      configManager.setBarcodeMissing(true);
    });
  } else {
    try {
      console.log('Barcode Scanner detected, starting scanner...');
      await startListeningToScanner(HIDPath, onBarcodeScan);
    } catch (error) {
      console.error('Error starting barcode scanner:', error.message);
    }
  }
}

function startHeartbeat() {
  const job = CronJob.from('*/10 * * * *', deviceHeartbeat);
  job.start();
}

exports.initializeDevices = async () => {
  if (configManager.getDeploymentType()) {
    await initSwiper();
    await initBarcode();
    if (configManager.getDeploymentType() === 'client-server') {
      startHeartbeat();
    }
  }
};

exports.setupOnboarding = () => {
  ipcMain.on('standalone-deployment', () => {
    configManager.setDeploymentType('standalone');
    if (windowManager.deviceOnboardingWindow) {
      windowManager.deviceOnboardingWindow.close();
    }
    initSwiper();
    initBarcode();
  });

  ipcMain.on('device-onboarding-submit', async (event, { serverUrl, friendlyName, location }) => {
    try {
      configManager.setServerUrl(serverUrl);
      configManager.setDeviceFriendlyName(friendlyName);
      configManager.setDeviceLocation(location);
      configManager.setDeploymentType('client-server');
      const response = await registerThisDevice();
      configManager.setServerToken(response.uuid);
      configManager.setDeviceId(response.id);

      event.sender.send('device-onboarding-success');
      if (windowManager.deviceOnboardingWindow) {
        windowManager.deviceOnboardingWindow.close();
      }
      await initSwiper();
      await initBarcode();
    } catch (err) {
      event.sender.send('device-onboarding-error', err.message);
    }
  });
};

exports.cleanup = () => {
  closeSwiper();
  closeScanner();
};
