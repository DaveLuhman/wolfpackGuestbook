const MAX_RECONNECTION_ATTEMPTS = 10;

class ReconnectionManager {
    constructor() {
        this.reconnectionAttempts = 0;
        this.isReconnecting = false;
    }

    attemptReconnection(path, callback, deviceType, createDeviceInstance) {
        if (this.isReconnecting) {
            return;
        }
        this.isReconnecting = true;

        if (this.reconnectionAttempts >= MAX_RECONNECTION_ATTEMPTS) {
            console.error(
                `Max reconnection attempts reached for ${deviceType}. Stopping further attempts.`,
            );
            callback(
                new Error(`Unable to reconnect to ${deviceType} after multiple attempts.`),
            );
            this.isReconnecting = false;
            return;
        }

        this.reconnectionAttempts++;
        setTimeout(async () => {
            try {
                console.log(
                    `Attempting to reconnect to ${deviceType}... (Attempt ${this.reconnectionAttempts})`,
                );
                createDeviceInstance(path, callback);
            } catch (error) {
                console.error("Reconnection attempt failed:", error.message);
                this.attemptReconnection(path, callback, deviceType, createDeviceInstance);
            } finally {
                this.isReconnecting = false;
            }
        }, 5000);
    }

    resetAttempts() {
        this.reconnectionAttempts = 0;
        this.isReconnecting = false;
    }
}

module.exports = new ReconnectionManager();