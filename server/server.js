// server/server.js
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  initDatabase,
  createJob,
  getJobStatus,
  getUserUsage,
  addUserUsage,
} from "./database.js"; // توابع Usage و Job
import { processVideoJob } from "./jobProcessor.js"; // Worker پس‌زمینه
import { v4 as uuidv4 } from "uuid"; // نیاز به نصب: npm install uuid

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const COOKIE_FILE = path.join(__dirname, "youtube.com_cookies.txt");
const DAILY_LIMIT_SECONDS = 7200;

await initDatabase();

/**
 * 🕓 بررسی و بروزرسانی مصرف روزانه (باید قبل از شروع Job چک شود)
 */
async function checkAndUpdateUsage(userId, videoSeconds) {
  const today = new Date().toISOString().split("T")[0];
  const used = await getUserUsage(userId, today);
  const totalUsed = used + videoSeconds;

  if (totalUsed > DAILY_LIMIT_SECONDS) {
    return { allowed: false, used, remaining: 0 };
  }

  // مصرف را در اینجا اضافه نمی‌کنیم تا Job با موفقیت کامل شود.
  // فقط بررسی می‌کنیم که آیا مجاز است یا نه.
  const remaining = Math.max(0, DAILY_LIMIT_SECONDS - totalUsed);
  return { allowed: true, used: used, remaining: remaining };
}

/**
 * 🚀 مسیر شروع پردازش (Asynchronous)
 */
app.post("/start-job", async (req, res) => {
  try {
    const { url, userId, videoDuration } = req.body;
    if (!url || !userId || !videoDuration)
      return res
        .status(400)
        .json({ success: false, error: "Missing URL, User ID, or Duration" });

    const duration = Number(videoDuration) || 0;
    const usage = await checkAndUpdateUsage(userId, duration);

    if (!usage.allowed) {
      return res.status(403).json({
        success: false,
        error: "سهمیه روزانه شما (۲ ساعت) تمام شده است.",
        usage,
      });
    }

    const jobId = uuidv4();
    await createJob(jobId, url, userId);

    // شروع پردازش در پس‌زمینه (Non-blocking)
    setImmediate(() => {
      processVideoJob(jobId, url, userId, duration);
    });

    console.log(
      `✅ [JOB ${jobId}] Job created and processing started in background.`
    );

    // پاسخ فوری به کاربر با Job ID (کد 202: Accepted)
    res.status(202).json({
      success: true,
      jobId: jobId,
      message: "Processing accepted. Use /status/:jobId to check progress.",
    });
  } catch (err) {
    console.error("❌ /start-job failed:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error during job creation.",
    });
  }
});

/**
 * 🔍 مسیر پیگیری وضعیت کار
 */
app.get("/status/:jobId", async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await getJobStatus(jobId);

    if (!job) {
      return res
        .status(404)
        .json({ success: false, error: "Job ID not found." });
    }

    const response = {
      success: true,
      jobId: jobId,
      status: job.status,
      videoUrl: job.video_url,
      createdAt: job.created_at,
      finishedAt: job.finished_at,
      captions: null,
      error: job.error_message || null,
    };

    if (job.status === "COMPLETED" && job.captions_json) {
      response.captions = JSON.parse(job.captions_json);
    }

    res.json(response);
  } catch (err) {
    console.error("❌ /status failed:", err);
    res
      .status(500)
      .json({
        success: false,
        error: "Internal server error during status check.",
      });
  }
});

/**
 * 🔄 ذخیره کوکی‌های یوتیوب (بدون تغییر)
 */
app.post("/upload-cookies", (req, res) => {
  try {
    const { cookies } = req.body;
    if (!cookies) return res.status(400).json({ error: "No cookies provided" });

    fs.writeFileSync(COOKIE_FILE, cookies, "utf8");
    console.log("✅ Cookies saved.");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * 🩺 تست سلامت سرور (بدون تغییر)
 */
app.get("/health", (_req, res) => res.json({ status: "ok" }));

const PORT = 7860; // پورت استاندارد Hugging Face
app.listen(PORT, () =>
  console.log(`🚀 Server running at http://localhost:${PORT}/start-job`)
);
