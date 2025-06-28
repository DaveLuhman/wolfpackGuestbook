use rusqlite::{params, Connection, Result};
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GuestEntry {
    pub id: i32,
    pub onecard: i32,
    pub name: Option<String>,
    pub entry_time: String,
}

pub struct Db {
    conn: Connection,
}

impl Db {
    pub fn new(path: &str) -> Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS GuestEntry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                onecard INTEGER,
                name TEXT,
                entryTime TEXT
            );",
        )?;
        Ok(Self { conn })
    }

    pub fn insert(&self, onecard: i32, name: Option<&str>) -> Result<()> {
        let now = chrono::Utc::now().to_rfc3339();
        self.conn.execute(
            "INSERT INTO GuestEntry (onecard, name, entryTime) VALUES (?1, ?2, ?3)",
            params![onecard, name, now],
        )?;
        Ok(())
    }

    pub fn all(&self) -> Result<Vec<GuestEntry>> {
        let mut stmt = self.conn.prepare("SELECT id, onecard, name, entryTime FROM GuestEntry")?;
        let entries = stmt
            .query_map([], |row| {
                Ok(GuestEntry {
                    id: row.get(0)?,
                    onecard: row.get(1)?,
                    name: row.get(2).ok(),
                    entry_time: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(entries)
    }

    pub fn flush(&self) -> Result<()> {
        self.conn.execute("DELETE FROM GuestEntry", [])?;
        Ok(())
    }
}
