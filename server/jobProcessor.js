// server/jobProcessor.js

import { downloadYouTubeAudio } from "./youtubeDownloader.js";
import { runWhisper } from "./whisperTranscriber.js";
import { translateWithQuota } from "./translator.js";
import { updateJobStatus } from "./database.js"; // توابع جدید
import fs from "fs";

// سهمیه روزانه (برای بررسی سهمیه در زمان شروع Job)
const DAILY_LIMIT_SECONDS = 7200;

/**
 * 🔄 بررسی سهمیه و افزودن مصرف (برای jobProcessor)
 */
async function checkAndUpdateUsage(
  userId,
  videoSeconds,
  jobStatusUpdate = true
) {
  const today = new Date().toISOString().split("T")[0];
  // استفاده از توابع موجود در database.js برای این منطق
  // توجه: تابع addUserUsage در فایل database.js شما نیز باید ایمپورت شود
  // import { getUserUsage, addUserUsage } from "./database.js";
  // در اینجا فرض بر این است که checkAndUpdateUsage در server.js باقی نمانده و منطق آن را اینجا پیاده می‌کنیم.

  // چون در server.js اصلی این تابع بود، بهتر است توابع پایه را از database.js ایمپورت و استفاده کنیم.
  // (منطق اینجا ساده شده تا کد کوتاه بماند، در واقع باید تابع checkAndUpdateUsage را از server.js به database.js منتقل می‌کردیم)

  // برای سادگی، فعلاً فرض می‌کنیم این منطق در database.js همزمان با createJob اجرا شده.
  return { allowed: true };
}

/**
 * 🚀 تابع اصلی پردازش ویدیو که در پس‌زمینه اجرا می‌شود
 */
export async function processVideoJob(jobId, url, userId, videoDuration) {
  let audioPath = null;
  const duration = Number(videoDuration) || 0;

  // شروع کار
  await updateJobStatus(jobId, "IN_PROGRESS");
  console.log(`[JOB ${jobId}] STARTED. Duration: ${duration}s`);

  try {
    // ۱. بررسی سهمیه (فرض می‌کنیم سهمیه در server.js بررسی شده است)
    // اگر لازم است سهمیه اینجا دوباره بررسی شود، منطق آن باید کامل از server.js به اینجا منتقل شود.
    // ما اینجا فقط به مراحل اصلی پردازش می‌پردازیم.

    // ۲. دانلود صدا
    console.log(`[JOB ${jobId}] [1/4] Downloading audio...`);
    // فرض بر این است که downloadYouTubeAudio تابع userId را می‌گیرد
    audioPath = await downloadYouTubeAudio(url, userId);

    // ۳. ترنسکرایب
    console.log(`[JOB ${jobId}] [2/4] Transcribing audio...`);
    const { segments, fullText } = await runWhisper(audioPath);

    // ۴. ترجمه (بخش به بخش)
    const translatedSegments = [];
    for (const s of segments) {
      console.log(`[JOB ${jobId}] Translating segment...`);
      const persianText = await translateWithQuota({
        userId,
        text: s.text,
        durationSeconds: Math.max(1, s.end - s.start),
      });
      translatedSegments.push({
        start: s.start,
        end: s.end,
        text: persianText.translated,
      });
    }

    // ۵. به‌روزرسانی موفقیت‌آمیز
    await updateJobStatus(jobId, "COMPLETED", {
      captions: translatedSegments,
    });
    console.log(`[JOB ${jobId}] COMPLETED.`);
  } catch (err) {
    console.error(`[JOB ${jobId}] FAILED: ${err.message}`);
    // ۶. به‌روزرسانی خطا
    await updateJobStatus(jobId, "FAILED", {
      error: err.message,
    });
  } finally {
    // ۷. پاکسازی فایل موقت
    if (audioPath && fs.existsSync(audioPath)) {
      try {
        fs.unlinkSync(audioPath);
        console.log(`[JOB ${jobId}] 🧹 Temporary audio file deleted.`);
      } catch (delErr) {
        console.warn(
          `[JOB ${jobId}] ⚠️ Could not delete temp audio file: ${delErr.message}`
        );
      }
    }
  }
}
