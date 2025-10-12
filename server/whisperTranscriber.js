// ...existing code...
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

// مسیر اجرای whisper-cli (whisper.cpp)
const WHISPER_PATH = path.resolve(
  process.cwd(),
  "../whisper.cpp/build/bin/Release/whisper-cli.exe"
);
const MODEL_PATH = path.resolve(process.cwd(), "./models/ggml-base.bin");

// پوشه‌ی موقتی برای خروجی‌ها
const DOWNLOADS_DIR = path.resolve(process.cwd(), "./server/downloads");
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
  console.log("📂 Created downloads folder:", DOWNLOADS_DIR);
}

/**
 * استخراج segments از JSON خروجی whisper.cpp با پشتیبانی از چند فرمت ممکن
 * @param {any} data
 * @returns {Array<{start:number,end:number,text:string}>}
 */
function extractSegmentsFromJson(data) {
  if (!data) return [];
  // مستقیم آرایه از segment ها
  if (Array.isArray(data) && data.length && typeof data[0]?.text === "string") {
    return data;
  }
  // شیء با فیلد segments
  if (Array.isArray(data.segments)) return data.segments;
  // برخی نسخه‌ها ممکن است نام های دیگر مثل chunks داشته باشند
  if (Array.isArray(data.chunks)) return data.chunks;
  // اگر یک آرایه شامل یک شیء حاوی segments باشد
  if (
    Array.isArray(data) &&
    data.length === 1 &&
    Array.isArray(data[0].segments)
  ) {
    return data[0].segments;
  }
  // جستجو در مقادیر برای پیدا کردن آرایه‌ای که segment-like باشد
  for (const val of Object.values(data)) {
    if (Array.isArray(val) && val.length && typeof val[0]?.text === "string")
      return val;
  }
  return [];
}

/**
 * اجرای whisper.cpp روی یک فایل صوتی و بازگرداندن segments و متن کامل
 * @param {string} audioPath مسیر فایل wav
 * @returns {Promise<{segments: {start:number,end:number,text:string}[], fullText: string}>}
 */
export async function runWhisper(audioPath) {
  return new Promise((resolve, reject) => {
    const outputBase = path.join(DOWNLOADS_DIR, `whisper_${Date.now()}`);
    const outputJson = `${outputBase}.json`;

    const args = [
      "-m",
      MODEL_PATH,
      "-f",
      audioPath,
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
    whisper.stderr.on("data", (d) => (stderrData += d.toString()));
    whisper.stdout.on("data", (d) => console.log("📜", d.toString()));

    whisper.on("error", (err) => {
      return reject(
        new Error(`Failed to start Whisper process: ${err.message}`)
      );
    });

    whisper.on("close", (code) => {
      // تلاش برای حذف فایل صوتی موقت
      try {
        if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
      } catch (e) {
        console.warn("⚠️ Couldn't delete temp audio:", e?.message || e);
      }

      if (code !== 0) {
        console.error("❌ Whisper exited with code:", code);
        console.error(stderrData);
        return reject(
          new Error(
            `Whisper failed (code ${code}): ${stderrData || "no stderr"}`
          )
        );
      }

      try {
        if (!fs.existsSync(outputJson)) {
          // اگر فایل JSON یافت نشد، چاپ خروجی stderr برای دیباگ
          return reject(new Error(`Output JSON not found: ${outputJson}`));
        }

        const raw = fs.readFileSync(outputJson, "utf8");
        let jsonData;
        try {
          jsonData = JSON.parse(raw);
        } catch (err) {
          return reject(
            new Error(`Invalid JSON produced by Whisper: ${err.message}`)
          );
        }

        const rawSegments = extractSegmentsFromJson(jsonData);
        if (!rawSegments || rawSegments.length === 0) {
          console.error("🔎 Whisper JSON (for debugging):", jsonData);
          return reject(
            new Error(`No segments found in Whisper output JSON: ${outputJson}`)
          );
        }

        const segments = rawSegments.map((s) => ({
          start: typeof s.start === "number" ? s.start : Number(s?.start || 0),
          end: typeof s.end === "number" ? s.end : Number(s?.end || 0),
          text: (s.text || "").toString().trim(),
        }));

        const fullText = segments
          .map((s) => s.text)
          .filter(Boolean)
          .join(" ")
          .trim();

        console.log(`✅ Whisper done. ${segments.length} segments found.`);

        try {
          fs.unlinkSync(outputJson);
        } catch (err) {
          console.warn("⚠️ Could not delete JSON:", err?.message || err);
        }

        resolve({ segments, fullText });
      } catch (err) {
        reject(err);
      }
    });
  });
}
// ...existing code...
