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

// ⚠️ تابع runSQLite که به ابزار خط فرمان sqlite3.exe وابسته بود، حذف شد.

// 🧱 ایجاد جدول‌ها
export async function initDatabase() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  console.log("📦 Initializing database:", DB_PATH);

  // جدول دانلودها (اختیاری، می‌توان حذف کرد اگر فقط Jobها را ذخیره می‌کنیم)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_url TEXT,
      file_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // جدول مصرف کاربر
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      seconds_used INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, day)
    );
  `);

  // جدول Job Tracking (جدول جدید برای معماری ناهمگام)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      video_url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, FAILED
      captions_json TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME
    );
  `);

  console.log("✅ Database ready:", DB_PATH);
}

// ----------------------------------------------------
// توابع Job Tracking

export async function createJob(jobId, url, userId) {
  if (!db) await initDatabase();
  await db.run("INSERT INTO jobs (id, user_id, video_url) VALUES (?, ?, ?)", [
    jobId,
    userId,
    url,
  ]);
}

export async function updateJobStatus(jobId, status, data = {}) {
  if (!db) await initDatabase();
  let query = `UPDATE jobs SET status = ?`;
  const params = [status];

  if (status === "COMPLETED" || status === "FAILED") {
    query += ", finished_at = CURRENT_TIMESTAMP";
  }

  if (data.captions) {
    query += ", captions_json = ?";
    params.push(JSON.stringify(data.captions));
  }
  if (data.error) {
    query += ", error_message = ?";
    params.push(data.error);
  }

  params.push(jobId);
  query += " WHERE id = ?";
  await db.run(query, params);
}

export async function getJobStatus(jobId) {
  if (!db) await initDatabase();
  return db.get(
    "SELECT status, captions_json, error_message, created_at, finished_at, video_url FROM jobs WHERE id = ?",
    [jobId]
  );
}

// ----------------------------------------------------
// توابع Usage Tracking

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
