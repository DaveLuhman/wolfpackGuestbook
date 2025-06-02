const axios = require('axios');
const configManager = require('../../configManager');
const dayjs = require('dayjs');

const submitEntry = async (onecard, name) => {

    const serverUrl = configManager.getServerUrl();
    const endpointUrl = `${serverUrl}/api/v1/entries/submit`;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${configManager.getServerToken()}`
    }
    const entryTime = dayjs().format();
    const response = await axios.post(endpointUrl, { onecard, name, entryTime }, { headers });
    return response.data;
}
module.exports = [submitEntry];