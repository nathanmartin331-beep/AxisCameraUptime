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
export const db = drizzle(sqlite, { schema });
