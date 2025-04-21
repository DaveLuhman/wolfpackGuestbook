const db = require('./db');
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
  }
};

module.exports = GuestEntry;