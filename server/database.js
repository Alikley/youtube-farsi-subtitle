// server/database.js
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "app.db");
const SQLITE_PATH = path.join(__dirname, "./app/sqlite3.exe");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

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
  if (!fs.existsSync(DB_PATH)) {
    console.log("📦 Creating new SQLite database...");
  }

  // جدول دانلودها (مثل قبل)
  await runSQLite(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_url TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // جدول استفاده روزانه برای محدودیت کاربر
  await runSQLite(`
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

// 🕒 دریافت مصرف روزانه کاربر
export async function getUserUsage(userId, day) {
  const query = `SELECT seconds_used FROM user_usage WHERE user_id='${userId}' AND day='${day}'`;
  const result = await runSQLite(query);
  return result ? parseInt(result.split("|")[0]) || 0 : 0;
}

// ➕ افزودن مصرف
export async function addUserUsage(userId, day, seconds) {
  const existing = await getUserUsage(userId, day);
  const newValue = existing + seconds;

  const insert = `
    INSERT OR REPLACE INTO user_usage (id, user_id, day, seconds_used)
    VALUES (
      (SELECT id FROM user_usage WHERE user_id='${userId}' AND day='${day}'),
      '${userId}',
      '${day}',
      ${newValue}
    );
  `;
  await runSQLite(insert);
  return newValue;
}
