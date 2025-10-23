// server/database.js
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url"; // اضافه کن

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // اضافه کن

const DB_DIR = path.join(__dirname, "data"); // تغییر به __dirname
const DB_PATH = path.join(DB_DIR, "app.db");
const SQLITE_PATH = path.join(__dirname, "./app/sqlite3.exe"); // تغییر به __dirname

// اگه مسیر دیتابیس وجود نداره، بسازش
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true }); // uncomment کن، خوبه!

/**
 * اجرای دستور SQLite با sqlite3.exe لوکال
 */
export async function runSQLite(query) {
  return new Promise((resolve, reject) => {
    // دیباگ اختیاری: uncomment کن اگه لازم بود
    // console.log("SQLite path:", SQLITE_PATH);
    // console.log("File exists?", fs.existsSync(SQLITE_PATH));

    if (!fs.existsSync(SQLITE_PATH)) {
      return reject(
        new Error("sqlite3.exe not found in /server folder. Please add it.")
      );
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

/**
 * مقداردهی اولیه دیتابیس (ساخت جدول‌ها در اولین اجرا)
 */
export async function initDatabase() {
  if (!fs.existsSync(DB_PATH)) {
    console.log("📦 Creating new SQLite database...");
    await runSQLite(`
      CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_url TEXT,
        file_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Database initialized.");
  } else {
    console.log("📚 Database ready:", DB_PATH);
  }
}
