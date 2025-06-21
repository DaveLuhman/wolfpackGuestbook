const knex = require("knex");
const dayjs = require("dayjs");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function getSharedDbPath() {
	switch (process.platform) {
		case 'win32':
			return path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'wolfpack-guestbook');
		case 'darwin':
			return '/Library/Application Support/wolfpack-guestbook';
		case 'linux': {
			// Prefer user-local writable location for non-root use
			const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
			return path.join(xdgDataHome, 'wolfpack-guestbook');
		}
		default:
			// Fallback to user local share for any other platform
			return path.join(os.homedir(), '.local', 'share', 'wolfpack-guestbook');
	}
}


function checkForDatabaseFile() {
	const directoryPath = getSharedDbPath();
	const filePath = path.join(directoryPath, 'guestbook.db');

	try {
		// Create directory with appropriate permissions
		if (!fs.existsSync(directoryPath)) {
			fs.mkdirSync(directoryPath, { recursive: true, mode: 0o777 });
			console.log('Created shared directory:', directoryPath);
		}

		// Create file if it doesn't exist
		if (!fs.existsSync(filePath)) {
			fs.writeFileSync(filePath, '', { mode: 0o666 });
			console.log('Created database file:', filePath);
		}

		// Ensure proper permissions on existing files
		fs.chmodSync(directoryPath, 0o777);
		fs.chmodSync(filePath, 0o666);

		return filePath;
	} catch (err) {
		console.error('Error setting up database file:', err);
		throw new Error(`Failed to setup database in shared location: ${err.message}`);
	}
}

// Initialize database file
const dbPath = checkForDatabaseFile();

const connectDB = knex({
	client: "better-sqlite3",
	connection: {
		filename: dbPath,
	},
	useNullAsDefault: true,
});
// Migration: Add sync_status and server_id columns if missing
async function migrateGuestEntryTable() {
	const columns = await connectDB('GuestEntry').columnInfo();
	if (!columns.sync_status) {
		await connectDB.schema.alterTable('GuestEntry', (table) => {
			table.string('sync_status').notNullable().defaultTo('pending');
		});
		console.log('Added sync_status column to GuestEntry');
	}
	if (!columns.server_id) {
		await connectDB.schema.alterTable('GuestEntry', (table) => {
			table.string('server_id').nullable();
		});
		console.log('Added server_id column to GuestEntry');
	}
}

async function ensureTables() {

	try {
		const hasGuestEntryTable = await connectDB.schema.hasTable("GuestEntry");
		if (!hasGuestEntryTable) {
			await connectDB.schema.createTable("GuestEntry", (table) => {
				table.increments("id").primary();
				table.integer("onecard");
				table.string("name").nullable();
				table.datetime("entryTime").notNullable().defaultTo(dayjs().format());
			});
			console.log("GuestEntry table created.");
		}
		console.log("SQLite connected and table ensured.");
	} catch (err) {
		console.error("Error setting up SQLite:", err.message);
		throw err;
	}
}

migrateGuestEntryTable().catch((err) => { console.error("Migration failed:", err.message); process.exit(1); });
ensureTables().catch((err) => {
	console.error("Failed to ensure tables:", err.message);
	process.exit(1);
});

module.exports = connectDB;
