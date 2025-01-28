const knex = require("knex");
const dayjs = require("dayjs");
const Database = require("better-sqlite3");

const fs = require("node:fs");
const path = require("node:path");

function checkForDatabaseFile() {
	const appDataPath = process.env.APPDATA;
	const directoryPath = path.join(appDataPath, "wolfpack-guestbook");
	const filePath = path.join(directoryPath, "guestbook.db");

	// Check if directory exists
	fs.stat(directoryPath, (err, stats) => {
		if (err) {
			// Directory does not exist, create it
			fs.mkdir(directoryPath, { recursive: true }, (err) => {
				if (err) {
					console.error("Error creating directory:", err);
					return;
				}

				// Directory created, now create the file
				fs.writeFile(filePath, "", (err) => {
					if (err) {
						console.error("Error creating file:", err);
					} else {
						console.log("File created successfully.");
					}
				});
			});
		} else if (stats.isDirectory()) {
			// Directory exists, now check if the file exists
			fs.stat(filePath, (err) => {
				if (err) {
					// File does not exist, create it
					fs.writeFile(filePath, "",  (err) => {
						if (err) {
							console.error("Error creating file:", err);
						} else {
							console.log("File created successfully.");
						}
					});
				} else {
					console.log("File already exists.");
				}
			});
		} else {
			console.error("Path exists but is not a directory.");
		}
	});
}

// Call the function
checkForDatabaseFile();

const connectDB = knex({
	client: "better-sqlite3",
	connection: {
		filename: `${process.env.APPDATA}/wolfpack-guestbook/guestbook.db`,
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
				table.string("name").notNullable();
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
