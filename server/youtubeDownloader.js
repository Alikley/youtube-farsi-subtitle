// server/youtubeDownloader.js
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import net from "net";
import http from "http";

// مسیر پوشه خروجی فایل صوتی
const OUTPUT_DIR = path.join(process.cwd(), "downloads");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// مسیر ابزارها
const YTDLP_PATH = path.join(process.cwd(), "yt-dlp.exe");
const FFMPEG_PATH =
  "C:\\Users\\Trust.Computer\\Downloads\\ffmpeg-8.0-essentials_build\\ffmpeg-8.0-essentials_build\\bin"; // مسیر ffmpeg خودت

// مسیر دیتابیس کوکی کروم
const CHROME_COOKIE_DB = path.join(
  os.homedir(),
  "AppData",
  "Local",
  "Google",
  "Chrome",
  "User Data",
  "Default",
  "Network",
  "Cookies"
);

// فایل کوکی موقت (برای yt-dlp)
const TEMP_COOKIE_FILE = path.join(
  process.cwd(),
  "server",
  "youtube.com_cookies.txt"
);

const POSSIBLE_PROXY_PORTS = [1080, 2080, 8080, 3128, 9050, 9999];

/** 🔍 تشخیص پراکسی فعال */
async function detectActiveProxy() {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (proxy) => {
      if (!resolved) {
        resolved = true;
        resolve(proxy);
      }
    };

    POSSIBLE_PROXY_PORTS.forEach((port) => {
      const socket = net.createConnection({ port, host: "127.0.0.1" });
      socket.setTimeout(500);
      socket.on("connect", () => {
        socket.destroy();
        finish(`socks5://127.0.0.1:${port}`);
      });
      socket.on("error", () => socket.destroy());
    });

    setTimeout(() => finish(null), 1500);
  });
}

/** 🧩 استخراج کوکی‌های YouTube از دیتابیس Chrome */
function extractYouTubeCookies() {
  try {
    if (!fs.existsSync(CHROME_COOKIE_DB)) {
      console.warn("⚠️ Chrome cookie DB not found:", CHROME_COOKIE_DB);
      return false;
    }

    // فایل موقت بسازیم تا قفل Chrome مشکلی نده
    const tempDb = path.join(
      os.tmpdir(),
      `chrome_cookies_${Date.now()}.sqlite`
    );
    fs.copyFileSync(CHROME_COOKIE_DB, tempDb);

    // اجرای دستور sqlite برای استخراج کوکی‌های youtube.com
    const sqlite3 = spawn("sqlite3", [
      tempDb,
      "SELECT host_key, name, value FROM cookies WHERE host_key LIKE '%youtube.com%';",
    ]);

    let data = "";
    sqlite3.stdout.on("data", (chunk) => (data += chunk.toString()));
    sqlite3.stderr.on("data", (err) =>
      console.error("sqlite3 err:", err.toString())
    );

    sqlite3.on("close", (code) => {
      if (code === 0 && data.trim()) {
        const cookieTxt = data
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [domain, name, value] = line.split("|");
            return `${domain}\tTRUE\t/\tFALSE\t0\t${name}\t${value}`;
          })
          .join("\n");

        fs.writeFileSync(TEMP_COOKIE_FILE, cookieTxt, "utf8");
        console.log("🍪 Cookies extracted to:", TEMP_COOKIE_FILE);
      } else {
        console.warn("⚠️ Failed to extract cookies from Chrome.");
      }
      fs.unlinkSync(tempDb); // حذف فایل موقت
    });

    return true;
  } catch (err) {
    console.error("❌ Cookie extraction error:", err);
    return false;
  }
}

/** 🎵 دانلود صوت از YouTube با پشتیبانی از کوکی و پراکسی */
export async function downloadYouTubeAudio(url) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!url) return reject(new Error("Invalid YouTube URL"));

      const cleanedUrl = url
        .replace(/&list=[^&]+/g, "")
        .replace(/&t=\d+s?/g, "")
        .trim();

      const outputPath = path.join(OUTPUT_DIR, `audio_${Date.now()}.wav`);
      const ytdlpPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : "yt-dlp";
      const proxy = await detectActiveProxy();

      // 🔹 تلاش برای ساخت فایل کوکی
      extractYouTubeCookies();

      const args = [
        "-x",
        "--audio-format",
        "wav",
        "--no-playlist",
        "--ffmpeg-location",
        FFMPEG_PATH,
        "-o",
        outputPath,
        "--user-agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "--add-header",
        "accept-language:en-US,en;q=0.9",
        "--add-header",
        "accept-encoding:gzip, deflate, br",
        ...(fs.existsSync(TEMP_COOKIE_FILE)
          ? ["--cookies", TEMP_COOKIE_FILE]
          : []),
        ...(proxy ? ["--proxy", proxy] : []),
        cleanedUrl,
      ];

      console.log("🎯 yt-dlp:", ytdlpPath);
      console.log("🌐 proxy:", proxy || "direct");
      console.log("🧩 args:", args.join(" "));

      const ytdlp = spawn(ytdlpPath, args, { windowsHide: true });
      let log = "";

      ytdlp.stdout.on("data", (d) => (log += d.toString()));
      ytdlp.stderr.on("data", (d) => (log += d.toString()));

      ytdlp.on("close", (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          console.log("✅ YouTube audio downloaded:", outputPath);
          resolve(outputPath);
        } else {
          console.error("❌ yt-dlp failed:\n", log);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          reject(new Error("yt-dlp download failed. Check logs."));
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
