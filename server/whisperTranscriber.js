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
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(WHISPER_BINARY)) {
      return reject(
        new Error(`Whisper binary not found at: ${WHISPER_BINARY}`)
      );
    }

    // مسیر خروجی JSON موقت
    const jsonOutputPath = `${audioPath}.json`;

    const args = [
      "-m",
      MODEL_PATH,
      "-f",
      audioPath,
      "-ojf", // خروجی json file
      "-of",
      path.basename(jsonOutputPath, ".json"), // نام فایل خروجی بدون پسوند
      "-otxt",
      "-osub", // این آرگومان‌ها را برای گرفتن خروجی JSON اضافه کردم
    ];

    console.log(
      `🧠 [Whisper] Transcribing audio with command: ${WHISPER_BINARY} ${args.join(
        " "
      )}`
    );

    const whisper = spawn(WHISPER_BINARY, args, {
      cwd: path.dirname(audioPath), // اجرای در دایرکتوری موقت
      windowsHide: true,
    });

    let log = "";
    whisper.stdout.on("data", (d) => (log += d.toString()));
    whisper.stderr.on("data", (d) => (log += d.toString()));

    whisper.on("close", (code) => {
      // 🧹 پاکسازی فایل‌های موقت
      const tempJsonFile = path.join(
        path.dirname(audioPath),
        path.basename(jsonOutputPath)
      );

      if (code !== 0) {
        if (fs.existsSync(tempJsonFile)) fs.unlinkSync(tempJsonFile);
        console.error(`❌ Whisper execution failed (Code: ${code}):\n`, log);
        return reject(new Error(`Whisper failed: ${log.slice(0, 500)}`));
      }

      if (!fs.existsSync(tempJsonFile)) {
        console.error(
          `❌ Whisper done, but JSON file not found: ${tempJsonFile}`
        );
        return reject(
          new Error("Whisper completed, but failed to generate JSON file.")
        );
      }

      try {
        const jsonData = fs.readFileSync(tempJsonFile, "utf8");
        const data = JSON.parse(jsonData);

        // 🧹 حذف فایل‌های موقت تولید شده
        fs.unlinkSync(tempJsonFile);
        // اگر ساب هم تولید کرده، حذف شود.
        const srtFile = tempJsonFile.replace(".json", ".srt");
        if (fs.existsSync(srtFile)) fs.unlinkSync(srtFile);

        let segments = data.result.segments.map((s) => ({
          start: s.t0 / 1000,
          end: s.t1 / 1000,
          text: s.text.trim(),
        }));

        const fullText = segments
          .map((s) => s.text)
          .join(" ")
          .trim();

        console.log(`✅ Whisper done. ${segments.length} segments found.`);
        resolve({ segments, fullText });
      } catch (err) {
        console.error(
          "❌ Failed to read or parse Whisper JSON output:",
          err.message
        );
        reject(new Error("Failed to process Whisper output."));
      }
    });
  });
}
