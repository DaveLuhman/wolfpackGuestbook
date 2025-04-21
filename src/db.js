const knex = require("knex");
const dayjs = require("dayjs");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

function getSharedDbPath() {
	// Determine platform-specific shared location
	switch (process.platform) {
		case 'win32':
			// On Windows, use the Public directory which is accessible to all users
			return path.join(process.env.PUBLIC || 'C:\\Users\\Public', 'wolfpack-guestbook');
		case 'darwin':
			// On macOS, use /Library/Application Support
			return '/Library/Application Support/wolfpack-guestbook';
		default:
			// On Linux and others, use /var/lib
			return '/var/lib/wolfpack-guestbook';
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

ensureTables().catch((err) => {
	console.error("Failed to ensure tables:", err.message);
	process.exit(1);
});

module.exports = connectDB;
