const db = require('./db');
const dayjs = require('dayjs')

const GuestEntry = {
  async create(onecard, name) {
    const entryTime = dayjs().format()
    console.log(`${name} written to database at ${entryTime}`)
    return await db('GuestEntry').insert({ onecard, name, entryTime });
  },
  async createAnonymousEntry () {
    const entryTime = dayjs().format()
    console.log("Inserting anonymous entry")
    return await db('GuestEntry').insert({onecard: 1000001, name: "Anonymous", entryTime})
  },
  async findEntry(onecard) {
    return await db('GuestEntry').where({ onecard }).first();
  },

  async getAllEntries() {
    return await db('GuestEntry')
  },
  async flush() {
    return await db('GuestEntry').del()
  }
};

module.exports = GuestEntry;