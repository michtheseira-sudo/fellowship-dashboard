import Database from "better-sqlite3";
import path from "path";

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "dashboard.db");

let db: Database.Database | null = null;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
  }
  return db;
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS funnel_weekly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season TEXT NOT NULL,
      year INTEGER NOT NULL,
      week_of_season INTEGER NOT NULL,
      stage_key TEXT NOT NULL,
      value INTEGER NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(season, year, week_of_season, stage_key)
    );

    CREATE TABLE IF NOT EXISTS attribution_weekly (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      season TEXT NOT NULL,
      year INTEGER NOT NULL,
      source TEXT NOT NULL,
      stage_key TEXT NOT NULL,
      value INTEGER NOT NULL,
      synced_at TEXT NOT NULL,
      UNIQUE(season, year, source, stage_key)
    );

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      ran_at TEXT NOT NULL
    );
  `);
}
