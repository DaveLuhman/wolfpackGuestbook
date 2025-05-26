const os = require("node:os")
function getPrimaryMacAddress() {
  const interfaces = os.networkInterfaces();

  for (const [name, configs] of Object.entries(interfaces)) {
    for (const config of configs) {
      if (
        config.family === 'IPv4' &&
        !config.internal &&
        config.mac &&
        config.mac !== '00:00:00:00:00:00'
      ) {
        // Prioritize eth0 and wlan0
        if (name === 'eth0' || name === 'wlan0') {
          return { interface: name, mac: config.mac };
        }
      }
    }
  }

  // Fallback: just return the first valid one
  for (const configs of Object.values(interfaces)) {
    for (const config of configs) {
      if (
        config.family === 'IPv4' &&
        !config.internal &&
        config.mac &&
        config.mac !== '00:00:00:00:00:00'
      ) {
        return { interface: config.name || 'unknown', mac: config.mac };
      }
    }
  }

  throw new Error('No valid network interface found.');
}


module.exports = {
  getPrimaryMacAddress
};