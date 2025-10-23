// server/youtubeDownloader.js
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import net from "net";
import http from "http";

const OUTPUT_DIR = path.join(process.cwd(), "downloads");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// مسیر اجرایی‌ها از پوشه‌ی لوکال پروژه
const BIN_DIR = path.join(process.cwd(), "server");

const YTDLP_PATH = path.join(BIN_DIR, "./app/yt-dlp.exe");
const FFMPEG_PATH = path.join(BIN_DIR, "./app/ffmpeg.exe");
// const SQLITE_PATH = path.join(BIN_DIR, "sqlite3.exe");

const COOKIE_FILE = path.join(BIN_DIR, "youtube.com_cookies.txt");

const POSSIBLE_PROXY_PORTS = [1080, 2080, 8080, 3128, 9050, 9999];

/**
 * 🔍 تشخیص خودکار فیلترشکن لوکال (SOCKS5 یا HTTP)
 */
async function detectActiveProxy() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (proxy) => {
      if (!done) {
        done = true;
        resolve(proxy);
      }
    };

    POSSIBLE_PROXY_PORTS.forEach((port) => {
      // تست HTTP
      const httpTest = http.get(
        { host: "127.0.0.1", port, path: "/", timeout: 700 },
        () => finish(`http://127.0.0.1:${port}`)
      );
      httpTest.on("error", () => {});
      httpTest.on("timeout", () => httpTest.destroy());

      // تست SOCKS
      const socket = net.createConnection({ port, host: "127.0.0.1" });
      socket.setTimeout(700);
      socket.on("connect", () => {
        socket.destroy();
        finish(`socks5://127.0.0.1:${port}`);
      });
      socket.on("error", () => socket.destroy());
      socket.on("timeout", () => socket.destroy());
    });

    setTimeout(() => finish(null), 2500);
  });
}

/**
 * 🎵 دانلود صوت از یوتیوب با yt-dlp و ffmpeg
 */
export async function downloadYouTubeAudio(url) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!url) return reject(new Error("Invalid YouTube URL"));

      const cleanedUrl = url
        .replace(/&list=[^&]+/g, "")
        .replace(/&t=\d+s?/g, "")
        .trim();

      const outputPath = path.join(OUTPUT_DIR, `audio_${Date.now()}.wav`);

      // فایل‌ها باید در پروژه موجود باشند
      const ytdlpPath = fs.existsSync(YTDLP_PATH) ? YTDLP_PATH : "yt-dlp";
      const ffmpegPath = fs.existsSync(FFMPEG_PATH) ? FFMPEG_PATH : "ffmpeg";
      const cookiesPath = fs.existsSync(COOKIE_FILE) ? COOKIE_FILE : null;

      const proxy = await detectActiveProxy();

      console.log("🎯 yt-dlp:", ytdlpPath);
      console.log("🎧 ffmpeg:", ffmpegPath);
      console.log("🍪 cookies:", cookiesPath ? "✅ used" : "❌ none");
      console.log("🌐 proxy:", proxy || "direct");

      const args = [
        "-x",
        "--audio-format",
        "wav",
        "--no-playlist",
        "--ffmpeg-location",
        path.dirname(ffmpegPath),
        "-o",
        outputPath,
        ...(cookiesPath ? ["--cookies", cookiesPath] : []),
        ...(proxy ? ["--proxy", proxy] : []),
        cleanedUrl,
      ];

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
