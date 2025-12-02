// D:\youtube-farsi-subtitle\youtube-farsi-subtitle\client\public\background\index.js

console.log("⚙️ [Background] Service worker loaded");
let cachedUserId = null;
let cachedCookies = null;
// 🎯 تغییر مهم: تعریف آدرس API جدید Hugging Face
const API_BASE_URL = "https://alikley933-navak.hf.space";

async function postJSON(url, data) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    // برای Polling نیاز است که کل پاسخ (شامل 202) برگردد
    return { success: res.ok, status: res.status, data: await res.json() };
  } catch (err) {
    console.error(`❌ POST ${url} failed:`, err);
    return { success: false, error: err.message };
  }
}

// 🎯 تابع جدید برای فراخوانی API های GET
async function getJSON(url) {
  try {
    const res = await fetch(url);
    // برای Polling نیاز است که کل پاسخ (شامل 200/404) برگردد
    return { success: res.ok, status: res.status, data: await res.json() };
  } catch (err) {
    console.error(`❌ GET ${url} failed:`, err);
    return { success: false, error: err.message };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.type) {
    case "REQUEST_UPLOAD_COOKIES":
      handleUploadCookies(msg, sendResponse);
      return true;

    // 🎯 تغییر مهم: تبدیل درخواست سنکرون به شروع کار ناهمگام
    case "REQUEST_START_JOB":
      handleStartJob(msg, sendResponse);
      return true;

    // 🎯 تابع جدید: برای Polling وضعیت از Content Script
    case "REQUEST_JOB_STATUS":
      handleJobStatus(msg, sendResponse);
      return true;

    case "UPDATE_USAGE":
      if (msg.usage) {
        chrome.storage.local.set({ usage: msg.usage });
        console.log("🔄 Usage updated:", msg.usage);
        chrome.runtime.sendMessage({
          type: "USAGE_UPDATED",
          usage: msg.usage,
        });
      }
      return;
  }
});

async function handleUploadCookies(msg, sendResponse) {
  try {
    if (!msg.userId) {
      const stored = await chrome.storage.local.get(["userId"]);
      msg.userId = stored.userId || "anonymous_user";
    }
    cachedUserId = msg.userId;
    const cookies = await chrome.cookies.getAll({
      url: "https://www.youtube.com",
    });
    const cookieTxt = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    cachedCookies = cookieTxt;
    // 🎯 تغییر آدرس: از localhost:3000 به API_BASE_URL
    const result = await postJSON(`${API_BASE_URL}/upload-cookies`, {
      cookies: cookieTxt,
      userId: cachedUserId,
    });
    sendResponse({ ok: true, server: result.data });
  } catch (err) {
    sendResponse({ ok: false, error: err.message });
  }
}

// 🎯 تابع جدید برای شروع کار (جایگزین handlePreloadVideo)
async function handleStartJob(msg, sendResponse) {
  try {
    const { videoUrl, userId, videoDuration } = msg; // دریافت Duration
    const finalUserId = userId || cachedUserId || "anonymous_user";

    // 🎯 فراخوانی start-job به جای preload
    const result = await postJSON(`${API_BASE_URL}/start-job`, {
      url: videoUrl,
      userId: finalUserId,
      videoDuration: videoDuration, // ارسال مدت زمان
    });

    // نتیجه را به Content Script برمی‌گرداند (Job ID یا خطا)
    sendResponse(result);
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// 🎯 تابع جدید برای Polling (چک کردن وضعیت)
async function handleJobStatus(msg, sendResponse) {
  try {
    const { jobId } = msg;
    const result = await getJSON(`${API_BASE_URL}/status/${jobId}`);

    // در صورت موفقیت، کل داده‌های وضعیت (شامل status و captions) ارسال می‌شود
    sendResponse(result);
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("🚀 Extension installed and background active");
});
