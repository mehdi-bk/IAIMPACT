import "server-only"
import { DatabaseSync } from "node:sqlite"
import fs from "node:fs"
import path from "node:path"
import { seedDatabase } from "./seed"

// Single SQLite database for the whole prototype (node:sqlite, no native build).
// All data is synthetic. The file lives in ./data and is git-ignored.

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  first_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'fr',
  preferences TEXT NOT NULL,
  demo_profile TEXT NOT NULL UNIQUE,
  demo_description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES customers(id),
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  masked_iban TEXT NOT NULL,
  balance_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'OPEN',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  merchant TEXT NOT NULL,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT NOT NULL,
  channel TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id, timestamp);

CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES customers(id),
  account_id TEXT NOT NULL REFERENCES accounts(id),
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  network TEXT NOT NULL,
  masked_number TEXT NOT NULL,
  holder TEXT NOT NULL,
  expiry TEXT NOT NULL,
  status TEXT NOT NULL,
  payment_limit_cents INTEGER NOT NULL,
  withdrawal_limit_cents INTEGER NOT NULL,
  spent_period_cents INTEGER NOT NULL,
  online_payments INTEGER NOT NULL DEFAULT 1,
  contactless INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS beneficiaries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES customers(id),
  name TEXT NOT NULL,
  masked_iban TEXT NOT NULL,
  internal_account_id TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  visitor_prefs TEXT
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  session_hash TEXT NOT NULL,
  customer_id TEXT,
  created_at TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '{}',
  workflow TEXT NOT NULL DEFAULT '{}',
  messages TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS pending_actions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  session_hash TEXT NOT NULL,
  type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  params TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  result TEXT
);

CREATE TABLE IF NOT EXISTS support_handoffs (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  session_hash TEXT,
  channel TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  decision TEXT NOT NULL,
  detail TEXT NOT NULL
);
`

type Global = typeof globalThis & { __compassDb?: DatabaseSync }

function dbPath(): string {
  if (process.env.COMPASS_DB_PATH) return process.env.COMPASS_DB_PATH
  return path.join(process.cwd(), "data", "compass.db")
}

export function db(): DatabaseSync {
  const g = globalThis as Global
  if (g.__compassDb) return g.__compassDb
  const file = dbPath()
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true })
  const conn = new DatabaseSync(file)
  conn.exec("PRAGMA journal_mode = WAL;")
  conn.exec(SCHEMA)
  const row = conn.prepare("SELECT COUNT(*) AS n FROM customers").get() as { n: number }
  if (row.n === 0) seedDatabase(conn)
  g.__compassDb = conn
  return conn
}

/** Run fn inside a SQLite transaction (all-or-nothing). */
export function tx<T>(fn: () => T): T {
  const conn = db()
  conn.exec("BEGIN IMMEDIATE")
  try {
    const out = fn()
    conn.exec("COMMIT")
    return out
  } catch (e) {
    conn.exec("ROLLBACK")
    throw e
  }
}

/**
 * Deterministic demo reset: wipes banking data, conversations, actions and
 * audit trail, then re-seeds. Customers are upserted (preferences restored).
 * With clearSessions, every browser session falls back to visitor.
 */
export function resetDemoData(opts: { clearSessions?: boolean } = {}) {
  const conn = db()
  conn.exec("BEGIN IMMEDIATE")
  try {
    conn.exec(`
      DELETE FROM audit_log;
      DELETE FROM support_handoffs;
      DELETE FROM pending_actions;
      DELETE FROM conversations;
      DELETE FROM beneficiaries;
      DELETE FROM cards;
      DELETE FROM transactions;
      DELETE FROM accounts;
    `)
    if (opts.clearSessions) conn.exec("DELETE FROM sessions;")
    seedDatabase(conn)
    conn.exec("COMMIT")
  } catch (e) {
    conn.exec("ROLLBACK")
    throw e
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
