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
ensureColumn('cameras', 'ssl_fingerprint', 'TEXT');
ensureColumn('cameras', 'ssl_fingerprint_first_seen', 'INTEGER');
ensureColumn('cameras', 'ssl_fingerprint_last_verified', 'INTEGER');

export const db = drizzle(sqlite, { schema });
export { sqlite };
