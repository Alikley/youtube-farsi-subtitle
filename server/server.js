// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { downloadYouTubeAudio } from "./youtubeDownloader.js";
import { runWhisper } from "./whisperTranscriber.js";
import { translateWithQuota } from "./translator.js";
import { initDatabase, getUserUsage, addUserUsage } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const COOKIE_FILE = path.join(__dirname, "youtube.com_cookies.txt");
const DAILY_LIMIT_SECONDS = 7200;

await initDatabase();

/**
 * 🕓 بررسی و بروزرسانی مصرف روزانه
 */
async function checkAndUpdateUsage(userId, videoSeconds) {
  const today = new Date().toISOString().split("T")[0];
  const used = await getUserUsage(userId, today);
  const totalUsed = used + videoSeconds;

  if (totalUsed > DAILY_LIMIT_SECONDS) {
    return { allowed: false, used, remaining: 0 };
  }

  const newUsed = await addUserUsage(userId, today, videoSeconds);
  const remaining = Math.max(0, DAILY_LIMIT_SECONDS - newUsed);
  return { allowed: true, used: newUsed, remaining };
}

/**
 * ✅ مسیر اصلی پردازش ویدیو
 */
app.post("/preload", async (req, res) => {
  let audioPath = null;
  try {
    const { url, userId, videoDuration } = req.body;
    if (!url || !userId)
      return res.status(400).json({ success: false, error: "Missing data" });

    const duration = Number(videoDuration) || 0;
    const usage = await checkAndUpdateUsage(userId, duration);

    if (!usage.allowed) {
      return res.status(403).json({
        success: false,
        error: "سهمیه روزانه شما (۲ ساعت) تمام شده است.",
        usage,
      });
    }

    console.log(
      `👤 User ${userId}: used ${usage.used}s / ${DAILY_LIMIT_SECONDS}s`
    );

    console.log("🎬 [1/4] Downloading YouTube audio...");
    audioPath = await downloadYouTubeAudio(url);

    console.log("🧠 [2/4] Transcribing audio...");
    const { segments, fullText } = await runWhisper(audioPath);

    const translatedSegments = [];
    for (const s of segments) {
      try {
        const persianText = await translateWithQuota({
          userId,
          text: s.text,
          durationSeconds: Math.max(1, s.end - s.start),
        });
        translatedSegments.push({
          start: s.start,
          end: s.end,
          text: persianText.translated,
        });
      } catch (err) {
        translatedSegments.push({ start: s.start, end: s.end, text: s.text });
      }
    }

    res.json({
      success: true,
      captions: translatedSegments,
      usage: {
        used: usage.used,
        limit: DAILY_LIMIT_SECONDS,
        remaining: usage.remaining,
      },
    });
  } catch (err) {
    console.error("❌ /preload failed:", err);
    const today = new Date().toISOString().split("T")[0];
    const used = req.body?.userId
      ? await getUserUsage(req.body.userId, today)
      : 0;
    res.status(500).json({
      success: false,
      error: err.message,
      usage: { used, limit: DAILY_LIMIT_SECONDS },
    });
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
 * 🔄 ذخیره کوکی‌های یوتیوب
 */
app.post("/upload-cookies", (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies) return res.status(400).json({ error: "No cookies provided" });

    fs.writeFileSync(COOKIE_FILE, cookies, "utf8");
    console.log("✅ Cookies saved.");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * 🩺 تست سلامت سرور
 */
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}/preload`)
);
