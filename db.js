const knex = require('knex');
const dayjs = require('dayjs')

const connectDB = knex({
  client: 'sqlite3',
  connection: {
    filename: "./guestbook.db"
  },
  useNullAsDefault: true,
})

connectDB.schema.hasTable('GuestEntry').then(exists => {
  if (!exists) {
    return connectDB.schema.createTable('GuestEntry', table => {
      table.increments('id').primary();
      table.integer('onecard')
      table.string('name').notNullable();
      table.datetime('entryTime').notNullable();
    });
  }
}).then(() => {
  console.log('SQLite connected and table ensured.');
}).catch(err => {
  console.error('Error setting up SQLite:', err.message);
});

module.exports = connectDB;
