// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { downloadYouTubeAudio } from "./youtubeDownloader.js";
import { runWhisper } from "./whisperTranscriber.js";
import { translateToPersian } from "./translator.js";
import { initDatabase, runSQLite } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const COOKIE_FILE = path.join(__dirname, "youtube.com_cookies.txt");

// ✅ مسیر اصلی برای دانلود، ترنسکریپت، ترجمه و حذف فایل موقت
app.post("/preload", async (req, res) => {
  let audioPath = null;
  try {
    const { url } = req.body;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, error: "No YouTube URL provided" });
    }

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
        const persianText = await translateToPersian(s.text);
        translatedSegments.push({
          start: s.start,
          end: s.end,
          text: persianText,
        });
      } catch (tErr) {
        console.warn(
          `⚠️ Translation failed for segment [${s.start}-${s.end}]:`,
          tErr.message
        );
        translatedSegments.push({
          start: s.start,
          end: s.end,
          text: s.text, // fallback: متن انگلیسی
        });
      }
    }

    console.log("✅ [4/4] All segments processed successfully!");

    res.json({
      success: true,
      englishSegments: segments,
      captions: translatedSegments,
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

// 🔄 ذخیره کوکی‌های یوتیوب از افزونه
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

// 🩺 مسیر سلامت برای تست
app.get("/health", (_req, res) => {
  res.json({ status: "ok", message: "Server running and ready ✅" });
});

const PORT = 3000;
await initDatabase();

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/preload`);
});
