import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from "@shared/schema";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use DATABASE_URL if provided, otherwise default to local SQLite
const dbPath = process.env.DATABASE_URL?.replace('sqlite:', '') || join(__dirname, '..', 'data', 'camera-uptime.db');

const sqlite = new Database(dbPath);

// SQLite performance PRAGMAs for high-concurrency workloads (2500+ cameras)
sqlite.pragma('journal_mode = WAL');           // Concurrent reads during writes
sqlite.pragma('busy_timeout = 5000');          // Wait 5s on lock vs instant SQLITE_BUSY
sqlite.pragma('synchronous = NORMAL');         // Safe with WAL, fewer fsyncs
sqlite.pragma('cache_size = -64000');          // 64MB page cache
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('temp_store = MEMORY');
sqlite.pragma('mmap_size = 268435456');        // 256MB memory-mapped I/O

// Auto-migrate: add missing columns that were added to schema after initial table creation
function ensureColumn(table: string, column: string, type: string) {
  const cols = sqlite.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
ensureColumn('analytics_daily_summary', 'metadata', 'TEXT');
ensureColumn('analytics_hourly_summary', 'metadata', 'TEXT');
ensureColumn('analytics_hourly_summary', 'scenario', "TEXT NOT NULL DEFAULT 'default'");
ensureColumn('analytics_daily_summary', 'scenario', "TEXT NOT NULL DEFAULT 'default'");
ensureColumn('cameras', 'ssl_fingerprint', 'TEXT');
ensureColumn('cameras', 'ssl_fingerprint_first_seen', 'INTEGER');
ensureColumn('cameras', 'ssl_fingerprint_last_verified', 'INTEGER');
ensureColumn('cameras', 'cert_validation_mode', "TEXT NOT NULL DEFAULT 'none'");
ensureColumn('cameras', 'cert_mismatch', "INTEGER NOT NULL DEFAULT 0");
ensureColumn('user_settings', 'default_cert_validation_mode', "TEXT NOT NULL DEFAULT 'none'");
ensureColumn('user_settings', 'global_ca_cert', 'TEXT');
ensureColumn('user_settings', 'hourly_retention_days', 'INTEGER DEFAULT 30');
ensureColumn('report_schedules', 'granularity', "TEXT NOT NULL DEFAULT 'daily'");
ensureColumn('app_settings', 'report_timezone', 'TEXT');

// Migrate existing cameras: verifySslCert=true → certValidationMode='ca'
try {
  sqlite.exec(`UPDATE cameras SET cert_validation_mode = 'ca' WHERE verify_ssl_cert = 1 AND cert_validation_mode = 'none'`);
} catch { /* migration already done or column doesn't exist yet */ }

// Migrate unique indexes to include scenario column
// Drop old indexes (without scenario) and create new ones (with scenario)
try {
  sqlite.exec(`DROP INDEX IF EXISTS idx_analytics_hourly_camera_type_hour`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_hourly_camera_type_scenario_hour ON analytics_hourly_summary(camera_id, event_type, scenario, hour_start)`);
  sqlite.exec(`DROP INDEX IF EXISTS idx_analytics_daily_camera_type_day`);
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_daily_camera_type_scenario_day ON analytics_daily_summary(camera_id, event_type, scenario, day_start)`);
} catch { /* indexes already migrated */ }

// Create api_keys table for external API authentication
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_prefix TEXT NOT NULL,
    scopes TEXT,
    created_at INTEGER,
    last_used_at INTEGER,
    expires_at INTEGER
  )
`);

// Create webhooks table for external event delivery subscriptions
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT,
    active INTEGER DEFAULT 1,
    created_at INTEGER,
    last_delivery_at INTEGER,
    consecutive_failures INTEGER DEFAULT 0
  )
`);

// Instance-wide app settings (singleton row, id = 'default')
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    id TEXT PRIMARY KEY,
    sendgrid_api_key TEXT,
    sendgrid_api_key_prefix TEXT,
    from_email TEXT,
    from_name TEXT,
    email_enabled INTEGER DEFAULT 0,
    report_timezone TEXT,
    updated_at INTEGER
  )
`);

// Per-user scheduled report deliveries
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS report_schedules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    report_type TEXT NOT NULL DEFAULT 'analytics',
    range_days INTEGER NOT NULL,
    granularity TEXT NOT NULL DEFAULT 'daily',
    camera_ids TEXT,
    frequency TEXT NOT NULL,
    day_of_week INTEGER,
    day_of_month INTEGER,
    hour_local INTEGER NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    active INTEGER NOT NULL DEFAULT 1,
    last_run_at INTEGER,
    next_run_at INTEGER,
    last_error TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )
`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_report_schedules_user ON report_schedules(user_id)`);
sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON report_schedules(next_run_at, active)`);

export const db = drizzle(sqlite, { schema });
export { sqlite };
