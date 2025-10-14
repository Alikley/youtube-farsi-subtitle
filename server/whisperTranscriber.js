import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مسیر اجرای whisper-cli
const WHISPER_PATH = path.resolve(
  __dirname,
  "../whisper.cpp/build/bin/Release/whisper-cli.exe"
);

// مسیر مدل
const MODEL_PATH = path.resolve(__dirname, "./models/ggml-base.bin");

// مسیر پوشه دانلودها
const DOWNLOADS_DIR = path.resolve(__dirname, "./downloads");
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  console.log("📂 Created downloads folder:", DOWNLOADS_DIR);
}

/**
 * استخراج segmentها از JSON خروجی whisper.cpp
 */
function extractSegmentsFromJson(data) {
  if (!data) return [];
  if (Array.isArray(data.segments)) return data.segments;
  if (Array.isArray(data)) return data;
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && typeof v[0]?.text === "string") return v;
  }
  return [];
}

/**
 * استخراج segmentها از خروجی متنی whisper (stdout)
 */
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

/**
 * اجرای whisper.cpp روی فایل صوتی و برگرداندن segmentها با زمان‌بندی
 */
export async function runWhisper(audioPath) {
  return new Promise((resolve, reject) => {
    const resolvedAudioPath = path.resolve(audioPath);
    const outputBase = path.join(DOWNLOADS_DIR, `whisper_${Date.now()}`);
    const outputJson = `${outputBase}.json`;

    const args = [
      "-m",
      MODEL_PATH,
      "-f",
      resolvedAudioPath,
      "--output-json",
      "-of",
      outputBase,
      "--language",
      "en",
      "--print-progress",
      "false",
    ];

    console.log("🧠 Running Whisper:", WHISPER_PATH, args.join(" "));
    const whisper = spawn(WHISPER_PATH, args, { windowsHide: true });

    let stderrData = "";
    let stdoutData = "";

    whisper.stderr.on("data", (d) => (stderrData += d.toString()));
    whisper.stdout.on("data", (d) => (stdoutData += d.toString()));

    whisper.on("error", (err) => {
      reject(new Error(`Failed to start Whisper process: ${err.message}`));
    });

    whisper.on("close", (code) => {
      if (code !== 0) {
        console.error("❌ Whisper exited with code:", code);
        console.error(stderrData);
        return reject(
          new Error(
            `Whisper failed (code ${code}): ${stderrData || "no stderr"}`
          )
        );
      }

      let segments = [];

      try {
        if (fs.existsSync(outputJson)) {
          const raw = fs.readFileSync(outputJson, "utf8");
          const jsonData = JSON.parse(raw);
          const rawSegments = extractSegmentsFromJson(jsonData);
          segments = rawSegments.map((s) => ({
            start: Number(s.start ?? s.t0 ?? 0),
            end: Number(s.end ?? s.t1 ?? 0),
            text: (s.text || "").trim(),
          }));
          fs.unlinkSync(outputJson);
        }

        // اگر تایم‌ها صفر بودن، از خروجی متنی بخون
        if (!segments.length || segments.every((s) => s.start === 0)) {
          console.log("⚙️ Extracting timestamps from text output...");
          segments = parseSegmentsFromTextOutput(stdoutData);
        }

        const fullText = segments
          .map((s) => s.text)
          .join(" ")
          .trim();
        console.log(`✅ Whisper done. ${segments.length} segments found.`);
        resolve({ segments, fullText });
      } catch (err) {
        reject(err);
      }
    });
  });
}
