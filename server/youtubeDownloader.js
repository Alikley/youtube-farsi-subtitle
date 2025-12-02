import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import net from "net";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// مسیر ابزارها
const APP_DIR = path.join(__dirname, "app");
const YTDLP_PATH = path.join(APP_DIR, "yt-dlp.exe");
const FFMPEG_PATH = path.join(APP_DIR, "ffmpeg.exe");
const SQLITE_PATH = path.join(APP_DIR, "sqlite3.exe");

// دایرکتوری خروجی کلی
const OUTPUT_DIR = path.join(process.cwd(), "downloads");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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

// مسیر پیش‌فرض کوکی افزونه
const COOKIE_FILE = path.join(__dirname, "youtube.com_cookies.txt");

// پورت‌های احتمالی پراکسی
const POSSIBLE_PROXY_PORTS = [1080, 2080, 8080, 3128, 9050, 9999];

/** 🔍 شناسایی پراکسی فعال روی لوکال */
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
      socket.setTimeout(400);
      socket.on("connect", () => {
        socket.destroy();
        finish(`socks5://127.0.0.1:${port}`);
      });
      socket.on("error", () => socket.destroy());
    });

    setTimeout(() => finish(null), 1200);
  });
}

/** 🍪 استخراج کوکی‌های یوتیوب از دیتابیس کروم برای userId خاص */
async function extractYouTubeCookies(userId) {
  return new Promise((resolve) => {
    try {
      if (!fs.existsSync(CHROME_COOKIE_DB)) {
        console.warn("⚠️ Chrome cookie DB not found:", CHROME_COOKIE_DB);
        return resolve(false);
      }
      if (!fs.existsSync(SQLITE_PATH)) {
        console.warn("⚠️ sqlite3.exe not found at:", SQLITE_PATH);
        return resolve(false);
      }

      // کپی فایل کروم چون قفل داره
      const tempDb = path.join(
        os.tmpdir(),
        `chrome_cookies_${Date.now()}.sqlite`
      );
      fs.copyFileSync(CHROME_COOKIE_DB, tempDb);

      const sqlite = spawn(SQLITE_PATH, [
        tempDb,
        "SELECT host_key, name, value FROM cookies WHERE host_key LIKE '%youtube.com%';",
      ]);

      let data = "";
      sqlite.stdout.on("data", (chunk) => (data += chunk.toString()));
      sqlite.stderr.on("data", (err) =>
        console.error("sqlite3 err:", err.toString())
      );

      sqlite.on("close", (code) => {
        fs.unlinkSync(tempDb);
        if (code !== 0 || !data.trim()) {
          console.warn("⚠️ No cookies extracted from Chrome DB.");
          return resolve(false);
        }

        const cookieTxt = data
          .split("\n")
          .filter(Boolean)
          .map((line) => {
            const [domain, name, value] = line.split("|");
            return `${domain}\tTRUE\t/\tFALSE\t0\t${name}\t${value}`;
          })
          .join("\n");

        const userCookieFile = path.join(
          __dirname,
          `temp_youtube_cookies_${userId}.txt`
        );
        fs.writeFileSync(userCookieFile, cookieTxt, "utf8");
        console.log(
          `🍪 Cookies extracted for user ${userId} → ${userCookieFile}`
        );
        resolve(userCookieFile);
      });
    } catch (err) {
      console.error("❌ Cookie extraction error:", err);
      resolve(false);
    }
  });
}

/** 🎵 دانلود صوت از YouTube با کوکی اختصاصی برای هر userId */
export async function downloadYouTubeAudio(url, userId = "guest") {
  // 🛠️ اصلاح شد: فقط یک "new" باید باشد
  return new Promise(async (resolve, reject) => {
    const userCookieFile = path.join(
      __dirname,
      `temp_youtube_cookies_${userId}.txt`
    );
    let cookiesPath = fs.existsSync(COOKIE_FILE) ? COOKIE_FILE : null;
    const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null;

    try {
      if (!url) return reject(new Error("Invalid YouTube URL"));

      const cleanedUrl = url
        .replace(/&list=[^&]+/g, "")
        .replace(/&t=\d+s?/g, "")
        .trim();

      const userOutputDir = path.join(OUTPUT_DIR, userId);
      if (!fs.existsSync(userOutputDir))
        fs.mkdirSync(userOutputDir, { recursive: true });

      const outputPath = path.join(userOutputDir, `audio_${Date.now()}.wav`);

      const args = [
        "-x",
        "--audio-format",
        "wav",
        "--audio-quality",
        "0",
        "--no-playlist",
        "-o",
        outputPath,
        "--user-agent",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
        "--add-header",
        "accept-language:en-US,en;q=0.9",
        "--add-header",
        "accept-encoding:gzip, deflate, br",
        "--no-check-certificate", // اضافه شده برای جلوگیری از خطاهای SSL
        ...(cookiesPath ? ["--cookies", cookiesPath] : []),
        ...(proxy ? ["--proxy", proxy] : []),
        cleanedUrl,
      ];

      console.log(`🎧 [${userId}] yt-dlp starting...`);

      const ytdlp = spawn(YTDLP_PATH, args, { windowsHide: false });
      let log = "";

      ytdlp.stdout.on("data", (d) => (log += d.toString()));
      ytdlp.stderr.on("data", (d) => (log += d.toString()));

      ytdlp.on("close", (code) => {
        if (fs.existsSync(userCookieFile)) {
          try {
            fs.unlinkSync(userCookieFile);
          } catch (e) {}
        }

        if (code === 0 && fs.existsSync(outputPath)) {
          console.log(`✅ [${userId}] YouTube audio downloaded: ${outputPath}`);
          resolve(outputPath);
        } else {
          console.error(`❌ [${userId}] yt-dlp failed (Code: ${code}):\n`, log);
          reject(new Error(`yt-dlp download failed: ${log.slice(0, 500)}`));
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
