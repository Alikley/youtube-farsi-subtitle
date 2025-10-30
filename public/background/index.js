// public/background/index.js
console.log("⚙️ [Background] Service worker loaded");
// 🧠 حافظه موقت برای ذخیره اطلاعات کاربر
let cachedUserId = null;
let cachedCookies = null;
// 🎯 کمک‌کننده برای ارسال درخواست POST
async function postJSON(url, data) {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
        });
        return await res.json();
    }
    catch (err) {
        console.error(`❌ POST ${url} failed:`, err);
        return { success: false, error: err.message };
    }
}
// 🔄 پیام از content script یا popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "REQUEST_UPLOAD_COOKIES") {
        handleUploadCookies(msg, sendResponse);
        return true; // async response
    }
    if (msg.type === "REQUEST_PRELOAD_VIDEO") {
        handlePreloadVideo(msg, sendResponse);
        return true;
    }
    console.warn("⚠️ Unknown message type:", msg.type);
    sendResponse({ ok: false, error: "Unknown message type" });
});
// 🔹 ارسال کوکی‌ها به سرور
async function handleUploadCookies(msg, sendResponse) {
    try {
        // اگر userId نداشتیم، از local storage بگیریم
        if (!msg.userId) {
            const stored = await chrome.storage.local.get(["userId"]);
            msg.userId = stored.userId || "anonymous_user";
        }
        cachedUserId = msg.userId;
        console.log(`🍪 [UploadCookies] userId=${cachedUserId}`);
        // کوکی‌های یوتیوب را از مرورگر بگیر
        const cookies = await chrome.cookies.getAll({ domain: ".youtube.com" });
        const cookieTxt = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        cachedCookies = cookieTxt;
        // ارسال به سرور
        const result = await postJSON("http://localhost:3000/upload-cookies", {
            cookies: cookieTxt,
            userId: cachedUserId,
        });
        if (result?.ok) {
            console.log("✅ Cookies uploaded successfully for", cachedUserId);
        }
        else {
            console.warn("⚠️ Cookie upload failed:", result?.error);
        }
        sendResponse({ ok: true, server: result });
    }
    catch (err) {
        console.error("❌ handleUploadCookies failed:", err);
        sendResponse({ ok: false, error: err.message });
    }
}
// 🔹 پردازش ویدئو (دانلود، ترنسکریپت، ترجمه)
async function handlePreloadVideo(msg, sendResponse) {
    try {
        const { videoUrl, userId } = msg;
        if (!videoUrl) {
            return sendResponse({
                success: false,
                error: "No video URL provided",
            });
        }
        const finalUserId = userId || cachedUserId || "anonymous_user";
        console.log(`🎬 [Preload] Request from ${finalUserId}: ${videoUrl}`);
        const result = await postJSON("http://localhost:3000/preload", {
            url: videoUrl,
            userId: finalUserId,
        });
        if (result?.success) {
            console.log("✅ Video processed successfully:", result);
        }
        else {
            console.warn("⚠️ Video processing failed:", result?.error);
        }
        sendResponse(result);
    }
    catch (err) {
        console.error("❌ handlePreloadVideo failed:", err);
        sendResponse({ success: false, error: err.message });
    }
}
// 🩺 برای دیباگ دستی از console
chrome.runtime.onInstalled.addListener(() => {
    console.log("🚀 Extension installed and background active");
});
