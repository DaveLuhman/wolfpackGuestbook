const axios = require('axios');
const configManager = require('../../configManager');

const submitEntry = async (onecard, name) => {

    const rootServerUrl = configManager.getServerUrl();
    const serverUrl = `${rootServerUrl}/api/entries/submit`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${configManager.getServerToken()}`
    }
    const entryTime = dayjs().format();
    console.log(`${name} written to database at ${entryTime}`);
    try {
      await db('GuestEntry').insert({ onecard, name, entryTime });
    } catch (error) {
      console.error("Error creating guest entry:", error.message);
      throw error;
    }
    const response = await axios.post(serverUrl, { onecard, name, entryTime }, { headers });
    return response.data;
}
module.exports = [submitEntry]; 