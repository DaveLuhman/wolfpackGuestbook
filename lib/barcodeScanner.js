const HID = require('node-hid');
const reconnectionManager = require('./reconnectionUtility');

const parseScanData = (data) => {
  try {
    console.log('Parsing scan data:', data);
    // Remove carets and any non-numeric characters
    const onecard = data.replace(/[^0-9]/g, '').trim();
    console.log('After removing non-numeric characters:', onecard);

    if (!onecard || onecard.length < 7) {
      throw new Error('Invalid scan data format');
    }
    // Convert the string to a number
    const result = Number(onecard);
    console.log('Final parsed number:', result);
    return result;
  } catch (error) {
    console.error('Error parsing scan data:', error.message);
    throw error;
  }
};

const getScanner = async (path) => {
  try {
    if (!path) {
      const devices = HID.devices();
      const scannerDevice = devices.find(
        (device) =>
          device.vendorId === 1504 && // Symbol vendor ID in base 10
          (device.manufacturer?.includes('Symbol') ||
            device.product?.includes('Bar Code Scanner'))
      );

      if (!scannerDevice) {
        throw new Error('No compatible barcode scanner found');
      }
      path = scannerDevice.path;
    }

    return new HID.HID(path);
  } catch (error) {
    console.error('Error finding barcode scanner:', error.message);
    throw error;
  }
};

const startListeningToScanner = async (device, callback) => {
  try {
    // Set up error handler
    device.on('error', (error) => {
      console.error('HID device error:', error.message);
      const detailedError = new Error(
        `HID device error: ${error.message || 'Unknown error'}`
      );
      detailedError.devicePath = device.path;
      detailedError.originalError = error;
      detailedError.type = 'device_error';

      if (
        error.message.includes('disconnected') ||
        error.message.includes('not found')
      ) {
        detailedError.message =
          'HID device disconnected. Attempting to reconnect...';
        detailedError.type = 'device_disconnected';
        callback(detailedError, null);
        reconnectionManager.attemptReconnection(
          device.path,
          callback,
          'Barcode Scanner',
          (path, callback) => {
            startListeningToScanner(path, callback);
          }
        );
      } else {
        callback(detailedError, null);
      }
    });

    return device;
  } catch (error) {
    console.error('Error setting up barcode scanner:', error.message);
    throw error;
  }
};

const closeScanner = (device) => {
  try {
    if (device) {
      device.close();
    }
  } catch (error) {
    console.error('Error closing barcode scanner:', error.message);
  }
};

module.exports = {
  getScanner,
  startListeningToScanner,
  closeScanner,
  parseScanData,
};
