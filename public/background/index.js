console.log("⚙️ [Background] Service worker loaded");
let cachedUserId = null;
let cachedCookies = null;
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
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "REQUEST_UPLOAD_COOKIES") {
        handleUploadCookies(msg, sendResponse);
        return true;
    }
    if (msg.type === "REQUEST_PRELOAD_VIDEO") {
        handlePreloadVideo(msg, sendResponse);
        return true;
    }
});
async function handleUploadCookies(msg, sendResponse) {
    try {
        if (!msg.userId) {
            const stored = await chrome.storage.local.get(["userId"]);
            msg.userId = stored.userId || "anonymous_user";
        }
        cachedUserId = msg.userId;
        const cookies = await chrome.cookies.getAll({ domain: ".youtube.com" });
        const cookieTxt = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        cachedCookies = cookieTxt;
        const result = await postJSON("http://localhost:3000/upload-cookies", {
            cookies: cookieTxt,
            userId: cachedUserId,
        });
        sendResponse({ ok: true, server: result });
    }
    catch (err) {
        sendResponse({ ok: false, error: err.message });
    }
}
async function handlePreloadVideo(msg, sendResponse) {
    try {
        const { videoUrl, userId } = msg;
        const finalUserId = userId || cachedUserId || "anonymous_user";
        const result = await postJSON("http://localhost:3000/preload", {
            url: videoUrl,
            userId: finalUserId,
        });
        if (result?.usage) {
            const { used, limit } = result.usage;
            await chrome.storage.local.set({ usage: { used, limit } });
            console.log(`💾 Updated usage: ${used}/${limit}`);
            // 📢 بلافاصله پیام به popup برای آپدیت زنده
            chrome.runtime.sendMessage({
                type: "USAGE_UPDATED",
                usage: { used, limit },
            });
        }
        sendResponse(result);
    }
    catch (err) {
        sendResponse({ success: false, error: err.message });
    }
}
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (msg.type === "UPDATE_USAGE" && msg.usage) {
        chrome.storage.local.set({ usage: msg.usage });
        console.log("🔄 Usage updated from content:", msg.usage);
        chrome.runtime.sendMessage({
            type: "USAGE_UPDATED",
            usage: msg.usage,
        });
    }
});
chrome.runtime.onInstalled.addListener(() => {
    console.log("🚀 Extension installed and background active");
});
