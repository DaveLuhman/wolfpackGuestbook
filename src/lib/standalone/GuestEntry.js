const db = require('../../db');
const dayjs = require('dayjs');

const GuestEntry = {
  async create(onecard, name) {
    const entryTime = dayjs().format();
    console.log(`${name} written to database at ${entryTime}`);
    try {
      return await db('GuestEntry').insert({ onecard, name, entryTime });
    } catch (error) {
      console.error("Error creating guest entry:", error.message);
      throw error;
    }
  },
  async createAnonymousEntry() {
    const entryTime = dayjs().format();
    console.log("Inserting anonymous entry");
    try {
      return await db('GuestEntry').insert({ onecard: 1000001, name: "Anonymous", entryTime });
    } catch (error) {
      console.error("Error creating anonymous entry:", error.message);
      throw error;
    }
  },
  async findEntry(onecard) {
    return await db('GuestEntry').where({ onecard }).first();
  },

  async getAllEntries() {
    return await db('GuestEntry');
  },
  async flush() {
    return await db('GuestEntry').del();
  },
  
  async syncPending(uploadFn) {
    // uploadFn should be a function that takes a record and returns a Promise with server_id
    const pending = await db('GuestEntry').where({ sync_status: 'pending' });
    for (const entry of pending) {
      if (entry.server_id) { continue }; // skip if already has server_id
      try {
        const server_id = await uploadFn(entry);
        await db('GuestEntry').where({ id: entry.id }).update({ sync_status: 'synced', server_id });
      } catch (err) {
        console.error('Sync failed for entry', entry.id, err.message);
        // Optionally, add error handling or retry logic here
      }
    }
  }
}

module.exports = GuestEntry;