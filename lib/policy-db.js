
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

const dataDirectory = path.join(process.cwd(), ".data");
const databasePath = path.join(dataDirectory, "accesslease.sqlite");

let database;

function initializeDatabase() {
  mkdirSync(dataDirectory, { recursive: true });

  const db = new DatabaseSync(databasePath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_text TEXT NOT NULL,
      status TEXT NOT NULL
        CHECK (status IN ('draft', 'approved', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      approved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS policy_rules (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      rule_type TEXT NOT NULL,
      parameters_json TEXT NOT NULL DEFAULT '{}',
      source_excerpt TEXT NOT NULL,
      confidence REAL,
      status TEXT NOT NULL
        CHECK (status IN ('candidate', 'approved', 'rejected')),
      created_at TEXT NOT NULL,
      approved_at TEXT,
      FOREIGN KEY (policy_id)
        REFERENCES policies(id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_policy_rules_policy
      ON policy_rules(policy_id);

    CREATE INDEX IF NOT EXISTS idx_policy_rules_status
      ON policy_rules(status);
  `);

  return db;
}

export function getPolicyDatabase() {
  if (!database) {
    database = initializeDatabase();
  }

  return database;
}
