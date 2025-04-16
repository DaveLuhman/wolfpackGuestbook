const db = require('./db');
const dayjs = require('dayjs');

const GuestEntry = {
  async create(onecard, name) {
    // Convert onecard to number if it's a string
    const onecardNumber = typeof onecard === 'string' ? Number(onecard) : onecard;

    if (!onecardNumber || Number.isNaN(onecardNumber)) {
      throw new Error('Onecard ID is required and must be a valid number');
    }
    if(onecardNumber.toString().length !== 7) {
      throw new Error('Onecard ID must be 7 digits long');
    }

    const entryTime = dayjs().format();
    console.log(`${name || 'Entry'} recorded at ${entryTime}`);

    try {
      return await db.transaction(async (trx) => {
        return await trx('GuestEntry').insert({
          onecard: onecardNumber,
          name: name,
          entryTime
        });
      });
    } catch (error) {
      console.error("Error creating guest entry:", error.message);
      throw error;
    }
  },

  async findEntry(onecard) {
    // Convert onecard to number if it's a string
    const onecardNumber = typeof onecard === 'string' ? Number(onecard) : onecard;

    if (!onecardNumber || Number.isNaN(onecardNumber)) {
      throw new Error('Onecard ID is required and must be a valid number');
    }

    try {
      return await db('GuestEntry').where({ onecard: onecardNumber }).first();
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