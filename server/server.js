// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { downloadYouTubeAudio } from "./youtubeDownloader.js";
import { runWhisper } from "./whisperTranscriber.js";
import { translateToPersian } from "./translator.js";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const COOKIE_FILE = path.join(
  process.cwd(),
  "server",
  "youtube.com_cookies.txt"
);

// ✅ مسیر اصلی برای دانلود و ترجمه با زمان‌بندی
app.post("/preload", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No YouTube URL provided" });

    console.log("⏳ Downloading audio...");
    const audioPath = await downloadYouTubeAudio(url);

    console.log("🧠 Transcribing with Whisper...");
    const { segments, fullText } = await runWhisper(audioPath);

    if (!segments?.length) {
      throw new Error("No segments found from Whisper output");
    }

    console.log(`🌍 Translating ${segments.length} segments...`);
    const translatedSegments = [];

    // ترجمه‌ی هر segment جداگانه با حفظ زمان
    for (const s of segments) {
      const persianText = await translateToPersian(s.text);
      translatedSegments.push({
        start: s.start,
        end: s.end,
        text: persianText,
      });
    }

    console.log("✅ All segments translated!");

    res.json({
      success: true,
      englishSegments: segments,
      captions: translatedSegments, // زیرنویس فارسی با زمان‌بندی
    });
  } catch (err) {
    console.error("❌ /preload failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 🔄 آپلود کوکی‌ها از افزونه
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

// مسیر سلامت برای تست سریع
app.get("/health", (_req, res) => {
  res.json({ status: "ok", message: "Server running and ready ✅" });
});

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}/preload`)
);
