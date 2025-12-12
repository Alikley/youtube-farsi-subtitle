// server/database.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "app.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let db;

export async function runSQLite(query) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(SQLITE_PATH)) {
      return reject(new Error("sqlite3.exe not found in /server/app folder."));
    }

    const args = [DB_PATH, query];
    const sqlite = spawn(SQLITE_PATH, args, { windowsHide: true });

    let output = "";
    let error = "";

    sqlite.stdout.on("data", (data) => (output += data.toString()));
    sqlite.stderr.on("data", (data) => (error += data.toString()));

    sqlite.on("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(error || "SQLite command failed"));
    });
  });
}

// 🧱 ایجاد جدول‌ها
export async function initDatabase() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  console.log("📦 Initializing database:", DB_PATH);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_url TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      seconds_used INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, day)
    );
  `);

  console.log("✅ Database ready:", DB_PATH);
}

// 🕒 گرفتن مصرف روزانه کاربر
export async function getUserUsage(userId, day) {
  if (!db) await initDatabase();
  const row = await db.get(
    "SELECT seconds_used FROM user_usage WHERE user_id = ? AND day = ?",
    [userId, day]
  );
  return row ? row.seconds_used : 0;
}

// ➕ افزودن مصرف روزانه
export async function addUserUsage(userId, day, seconds) {
  if (!db) await initDatabase();
  const current = await getUserUsage(userId, day);
  const total = current + seconds;

  await db.run(
    `INSERT INTO user_usage (user_id, day, seconds_used)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id, day) DO UPDATE SET seconds_used = excluded.seconds_used;`,
    [userId, day, total]
  );

  return total;
}
