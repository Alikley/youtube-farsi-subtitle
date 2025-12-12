import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import axios from "axios";
import FormData from "form-data";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مسیر مدل (فقط برای نسخه غیر-داکری)
const MODEL_PATH = path.resolve(__dirname, "./models/ggml-base.bin");

// مسیر پوشه دانلودها
const DOWNLOADS_DIR = path.resolve(__dirname, "./downloads");
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  console.log("📂 Created downloads folder:", DOWNLOADS_DIR);
}

function extractSegmentsFromJson(data) {
  if (!data) return [];
  if (Array.isArray(data.segments)) return data.segments;
  if (Array.isArray(data)) return data;
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && typeof v[0]?.text === "string") return v;
  }
  return [];
}

function parseSegmentsFromTextOutput(textOutput) {
  const regex =
    /\[(\d{2}):(\d{2}):(\d{2}\.\d{3})\s-->\s(\d{2}):(\d{2}):(\d{2}\.\d{3})\]\s+(.+)/g;
  const segments = [];
  let match;
  while ((match = regex.exec(textOutput)) !== null) {
    const start =
      parseInt(match[1]) * 3600 +
      parseInt(match[2]) * 60 +
      parseFloat(match[3]);
    const end =
      parseInt(match[4]) * 3600 +
      parseInt(match[5]) * 60 +
      parseFloat(match[6]);
    const text = match[7].trim().replace(/^["“”]+|["“”]+$/g, "");
    segments.push({ start, end, text });
  }
  return segments;
}

export async function runWhisper(audioPath) {
  return new Promise(async (resolve, reject) => {
    try {
      const resolvedAudioPath = path.resolve(audioPath);
      const form = new FormData();
      form.append("audio", fs.createReadStream(resolvedAudioPath));

      console.log("🌐 [Whisper] Sending audio to whisper service...");

      const response = await axios.post(
        "http://whisper:9000/transcribe",
        form,
        {
          headers: form.getHeaders(),
          timeout: 60000, // افزایش تایم‌اوت برای فایل‌های بزرگ
        }
      );

      const data = response.data;
      let segments = [];

      try {
        const rawSegments = extractSegmentsFromJson(data);
        segments = rawSegments.map((s) => ({
          start: Number(s.start ?? s.t0 ?? 0),
          end: Number(s.end ?? s.t1 ?? 0),
          text: (s.text || "").trim(),
        }));
      } catch (err) {
        console.log("⚠️ JSON Parse failed, trying text output...");
      }

      if (!segments.length || segments.every((s) => s.start === 0)) {
        console.log("⚙️ Extracting timestamps from text output...");
        segments = parseSegmentsFromTextOutput(JSON.stringify(data, null, 2));
      }

      const fullText = segments
        .map((s) => s.text)
        .join(" ")
        .trim();

      console.log(`✅ Whisper done. ${segments.length} segments found.`);
      resolve({ segments, fullText });
    } catch (err) {
      console.error("❌ Whisper service error:", err.message);
      reject(new Error(`Whisper service failed: ${err.message}`));
    }
  });
}
