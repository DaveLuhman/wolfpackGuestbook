const knex = require('knex');
const dayjs = require('dayjs')

const connectDB = knex({
  client: 'better-sqlite3',
  connection: {
    filename: "~/wolfpackGuestbook/guestbook.db"
  },
  useNullAsDefault: true,
})

connectDB.schema.hasTable('GuestEntry').then(exists => {
  if (!exists) {
    return connectDB.schema.createTable('GuestEntry', table => {
      table.increments('id').primary();
      table.integer('onecard')
      table.string('name').notNullable();
      table.datetime('entryTime').notNullable().defaultTo(dayjs());
    });
  }
}).then(() => {
  console.log('SQLite connected and table ensured.');
}).catch(err => {
  console.error('Error setting up SQLite:', err.message);
});

module.exports = connectDB;
