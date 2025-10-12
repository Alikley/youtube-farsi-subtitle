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

// ✅ تبدیل و ترجمه کامل ویدیو
app.post("/preload", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No YouTube URL provided" });

    console.log("⏳ Downloading audio...");
    const audioPath = await downloadYouTubeAudio(url);

    console.log("🧠 Transcribing with Whisper...");
    const english = await runWhisper(audioPath);

    console.log("🌍 Translating to Persian...");
    const persian = await translateToPersian(english);

    res.json({ success: true, english, persian });
  } catch (err) {
    console.error("❌ Failed:", err);
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

app.post("/api/translateVideo", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "No YouTube URL provided" });

    console.log("🎬 Starting translation pipeline for:", url);

    // ۱. دانلود صدا
    const audioPath = await downloadYouTubeAudio(url);

    // ۲. اجرای Whisper برای استخراج segments
    const { segments } = await runWhisper(audioPath);

    // ۳. ترجمه هر segment به فارسی
    const persianSegments = await translateSegments(segments);

    // ۴. برگرداندن caption نهایی
    res.json({
      success: true,
      captions: persianSegments,
    });
  } catch (err) {
    console.error("❌ Translation pipeline failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
// 📡 مسیر healthcheck برای ریلیز و تست سریع
app.get("/health", (_req, res) => {
  res.json({ status: "ok", message: "Server running and ready ✅" });
});

const PORT = 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}/preload`)
);
