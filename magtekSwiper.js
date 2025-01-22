const HID = require('node-hid')

let swiper;

const parseSwipeData = (data) => {
    try {
        data.replace(/\./g, '')
        const regex = /(?<=\^)(.*?)(?=\^)/
        const rawName = regex.exec(data)
        const name = rawName[0].trim()
        const onecardRegex = /(\d{7})\s{3}/
        const onecard = onecardRegex.exec(data)
        return { onecard: onecard[0].trim(), name }
    } catch (error) {
        console.log(error.message)
        throw new Error('Unable to determine Onecard/Name from provided input')
    }
}

const getMagtekSwiper = async () => {
    try {
        const devices = HID.devices()
        let devicePath
        const magtekDevice = devices.find(
            (device) =>
                device.vendorId === 2049 || device.manufacturer === 'Mag-Tek'
        )
        if (magtekDevice) {
            devicePath = magtekDevice.path
        } else {
            devicePath = devices
        }
        return devicePath
    } catch (error) {
        console.error(error.message)
        throw error
    }
}

const startListeningToSwiper = async (path, callback) => {
    try {
        swiper = new HID.HID(path)
        swiper.on('data', (dataBuffer) => {
            try {
                const swipeData = dataBuffer.toString('utf8')
                const onecardData = parseSwipeData(swipeData)
                callback(null, onecardData) // Pass null as the first argument to indicate no error
            } catch (error) {
                callback(error) // Pass the error to the callback
            }
        })
        swiper.on('error', (error) => {
            console.error('HID device error:', error.message);
            callback(new Error('HID device disconnected. Attempting to reconnect...'));
            attemptReconnection(path, callback);
        });
    } catch (error) {
        callback(error) // Pass the error to the callback
    }
}

// Function to attempt reconnection
const attemptReconnection = (path, callback) => {
    setTimeout(async () => {
        try {
            console.log('Attempting to reconnect to HID device...');
            swiper = new HID.HID(path);
            swiper.on('data', (dataBuffer) => {
                try {
                    const swipeData = dataBuffer.toString('utf8');
                    const onecardData = parseSwipeData(swipeData);
                    callback(null, onecardData);
                } catch (error) {
                    callback(error);
                }
            });
            swiper.on('error', (error) => {
                console.error('HID device error:', error.message);
                callback(new Error('HID device disconnected. Attempting to reconnect...'));
                attemptReconnection(path, callback);
            });
        } catch (error) {
            console.error('Reconnection attempt failed:', error.message);
            attemptReconnection(path, callback);
        }
    }, 5000); // Retry every 5 seconds
};

// Function to close the HID device
const closeSwiper = () => {
    if (swiper) {
      swiper.close();
      swiper = null;
      console.log('HID device connection closed.');
    }
  };
module.exports = {
    getMagtekSwiper,
    startListeningToSwiper,
    closeSwiper
}
