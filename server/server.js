// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { downloadYouTubeAudio } from "./youtubeDownloader.js";
import { runWhisper } from "./whisperTranscriber.js";
import { translateWithQuota } from "./translator.js";
import { initDatabase, runSQLite } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const COOKIE_FILE = path.join(__dirname, "youtube.com_cookies.txt");

// مقدار لیمیت روزانه (۲ ساعت = ۷۲۰۰ ثانیه)
const DAILY_LIMIT_SECONDS = 7200;

/**
 * ⏱ ایجاد جدول برای کنترل مصرف کاربران
 */
await initDatabase();
await runSQLite(`
  CREATE TABLE IF NOT EXISTS usage (
    userId TEXT PRIMARY KEY,
    usedSeconds INTEGER DEFAULT 0,
    lastReset TEXT
  );
`);

/**
 * 🕓 بررسی و آپدیت مصرف روزانه کاربر
 */
async function checkAndUpdateUsage(userId, videoSeconds) {
  if (!userId) throw new Error("Missing userId");

  const now = new Date();
  const today = now.toISOString().split("T")[0]; // فقط تاریخ (YYYY-MM-DD)

  // دریافت رکورد کاربر
  const row = await runSQLite(`SELECT * FROM usage WHERE userId = ?`, [userId]);

  // اگر رکورد وجود نداشت → ایجاد جدید
  if (!row) {
    await runSQLite(
      `INSERT INTO usage (userId, usedSeconds, lastReset) VALUES (?, ?, ?)`,
      [userId, videoSeconds, today]
    );
    return { allowed: true, remaining: DAILY_LIMIT_SECONDS - videoSeconds };
  }

  // اگر روز جدیدی است → ریست مصرف
  if (row.lastReset !== today) {
    await runSQLite(
      `UPDATE usage SET usedSeconds = ?, lastReset = ? WHERE userId = ?`,
      [videoSeconds, today, userId]
    );
    return { allowed: true, remaining: DAILY_LIMIT_SECONDS - videoSeconds };
  }

  // بررسی مصرف فعلی
  const totalUsed = row.usedSeconds + videoSeconds;
  if (totalUsed > DAILY_LIMIT_SECONDS) {
    return { allowed: false, remaining: DAILY_LIMIT_SECONDS - row.usedSeconds };
  }

  // آپدیت مصرف
  await runSQLite(`UPDATE usage SET usedSeconds = ? WHERE userId = ?`, [
    totalUsed,
    userId,
  ]);

  return { allowed: true, remaining: DAILY_LIMIT_SECONDS - totalUsed };
}

/**
 * ✅ مسیر اصلی برای پردازش ویدیو
 */
app.post("/preload", async (req, res) => {
  let audioPath = null;
  try {
    const { url, userId, videoDuration } = req.body;

    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: "No YouTube URL provided" });
    }
    if (!userId) {
      return res.status(400).json({ success: false, error: "Missing userId" });
    }

    // ⏱ بررسی لیمیت
    const duration = Number(videoDuration) || 0;
    const usage = await checkAndUpdateUsage(userId, duration);

    if (!usage.allowed) {
      return res.status(403).json({
        success: false,
        error:
          "سهمیه روزانه شما (۲ ساعت) به پایان رسیده است. لطفاً فردا دوباره تلاش کنید.",
        remaining: 0,
      });
    }

    console.log(`👤 User ${userId} has ${usage.remaining}s remaining today.`);

    console.log("🎬 [1/4] Downloading YouTube audio...");
    audioPath = await downloadYouTubeAudio(url);
    console.log("📁 Audio file saved at:", audioPath);

    console.log("🧠 [2/4] Transcribing audio with Whisper...");
    const { segments, fullText } = await runWhisper(audioPath);

    if (!segments?.length) throw new Error("No segments returned from Whisper");

    console.log(
      `🌍 [3/4] Translating ${segments.length} segments to Persian...`
    );
    const translatedSegments = [];

    for (const s of segments) {
      try {
        const persianText = await translateWithQuota({
          userId,
          text: s.text,
          durationSeconds: Math.max(1, s.end - s.start), // مثلاً هر بخش چند ثانیه طول می‌کشه
        });

        translatedSegments.push({
          start: s.start,
          end: s.end,
          text: persianText.translated, // چون حالا خروجی آبجکت هست
        });
      } catch (tErr) {
        console.warn(
          `⚠️ Translation failed for segment [${s.start}-${s.end}]:`,
          tErr.message
        );
        translatedSegments.push({
          start: s.start,
          end: s.end,
          text: s.text,
        });
      }
    }

    console.log("✅ [4/4] All segments processed successfully!");

    res.json({
      success: true,
      englishSegments: segments,
      captions: translatedSegments,
      remainingSeconds: usage.remaining,
    });
  } catch (err) {
    console.error("❌ /preload failed:", err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    // 🧹 حذف فایل صوتی موقت
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
        console.log("🧹 Temporary audio file deleted:", audioPath);
      } catch (delErr) {
        console.warn("⚠️ Could not delete temp audio file:", delErr.message);
      }
    }
  }
});

/**
 * 🔄 ذخیره کوکی‌های یوتیوب از افزونه
 */
app.post("/upload-cookies", (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies) return res.status(400).json({ error: "No cookies provided" });

    fs.writeFileSync(COOKIE_FILE, cookies, "utf8");
    console.log("✅ Cookies saved to:", COOKIE_FILE);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Failed to save cookies:", err);
    res.status(500).json({ error: String(err) });
  }
});

/**
 * 🩺 مسیر سلامت برای تست
 */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", message: "Server running and ready ✅" });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/preload`);
});
