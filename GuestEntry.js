const db = require('./db');
const dayjs = require('dayjs');

const GuestEntry = {
  async create(onecard, name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Name is required and must be a string');
    }

    if (!onecard || typeof onecard !== 'number') {
      throw new Error('Onecard ID is required and must be a number');
    }

    const entryTime = dayjs().format();
    console.log(`${name} written to database at ${entryTime}`);

    try {
      return await db.transaction(async (trx) => {
        const existingEntry = await trx('GuestEntry')
          .where({ onecard })
          .first();

        if (existingEntry) {
          throw new Error('Entry already exists for this Onecard ID');
        }

        return await trx('GuestEntry').insert({
          onecard,
          name,
          entryTime
        });
      });
    } catch (error) {
      console.error("Error creating guest entry:", error.message);
      throw error;
    }
  },

  async findEntry(onecard) {
    if (!onecard || typeof onecard !== 'number') {
      throw new Error('Onecard ID is required and must be a number');
    }

    try {
      return await db('GuestEntry').where({ onecard }).first();
    } catch (error) {
      console.error("Error finding entry:", error.message);
      throw error;
    }
  },

  async getAllEntries() {
    try {
      return await db('GuestEntry').orderBy('entryTime', 'desc');
    } catch (error) {
      console.error("Error getting all entries:", error.message);
      throw error;
    }
  },

  async flush() {
    try {
      return await db.transaction(async (trx) => {
        return await trx('GuestEntry').del();
      });
    } catch (error) {
      console.error("Error flushing entries:", error.message);
      throw error;
    }
  }
};

module.exports = GuestEntry;