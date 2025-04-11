const HID = require("node-hid");
const {
	getMagtekSwiper,
	startListeningToSwiper,
	closeSwiper,
} = require("./magtekSwiper");

class HIDManager {
    constructor() {
        this.currentDevice = null;
        this.callbacks = new Set();
    }

    getDevices() {
        try {
            const devices = HID.devices();
            return devices.filter(device =>
                device.vendorId === 2049 ||
                device.manufacturer === 'Mag-Tek' ||
                device.product.includes('MSR') ||
                device.product.includes('Swipe')
            );
        } catch (error) {
            console.error('Error getting HID devices:', error);
            return [];
        }
    }

    setDevice(path) {
        if (this.currentDevice) {
            closeSwiper();
        }

        if (path) {
            startListeningToSwiper(path, (error, data) => {
                if (error) {
                    this.notifyCallbacks('error', error);
                } else {
                    this.notifyCallbacks('data', data);
                }
            });
            this.currentDevice = path;
        }
    }

    on(event, callback) {
        this.callbacks.add({ event, callback });
    }

    off(event, callback) {
        for (const cb of this.callbacks) {
            if (cb.event === event && cb.callback === callback) {
                this.callbacks.delete(cb);
                break;
            }
        }
    }

    notifyCallbacks(event, data) {
        for (const cb of this.callbacks) {
            if (cb.event === event) {
                cb.callback(data);
            }
        }
    }

    close() {
        closeSwiper();
        this.currentDevice = null;
    }
}

module.exports = new HIDManager();