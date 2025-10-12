// ...existing code...
// src/background/index.ts
export {};
declare const chrome: any;
console.log("🧠 Background service worker loaded");

let popupPorts: any[] = [];

// Helper: امن ارسال پیام به تب (callback-based)
function safeSendMessage(tabId: number, message: any) {
  try {
    chrome.tabs.sendMessage(tabId, message, (response: any) => {
      if (chrome.runtime.lastError) {
        console.error("❌ Send message failed:", chrome.runtime.lastError);
      }
    });
  } catch (err) {
    console.error("❌ Exception while sending message:", err);
  }
}

// ----------------------------
// 🔌 اتصال به popup (logger)
chrome.runtime.onConnect.addListener((port: any) => {
  if (port.name === "popup-logger") {
    popupPorts.push(port);
    console.log("🔌 Popup connected:", popupPorts.length);
    port.onDisconnect.addListener(() => {
      popupPorts = popupPorts.filter((p) => p !== port);
      console.log("🔌 Popup disconnected:", popupPorts.length);
    });

    // ارسال وضعیت اولیه به popup
    try {
      port.postMessage({ type: "STATUS", status: "idle" });
    } catch (err) {
      console.warn("⚠️ postMessage to popup failed:", err);
    }
  }
});

// Helper: ارسال پیام به همه popupها
function sendToPopups(msg: any) {
  popupPorts.forEach((port) => {
    try {
      if (port) port.postMessage(msg);
    } catch (err) {
      console.warn("⚠️ Failed to post to a popup port:", err);
    }
  });
}

// 🍪 گرفتن کوکی‌های یوتیوب (از چند زیر دامنه)
async function getAllYouTubeCookies(): Promise<any[]> {
  const domains = [".youtube.com", ".www.youtube.com", ".accounts.youtube.com"];
  let allCookies: any[] = [];
  for (const d of domains) {
    try {
      const list = await new Promise<any[]>((resolve) => {
        chrome.cookies.getAll({ domain: d }, (ck: any) => resolve(ck || []));
      });
      allCookies = allCookies.concat(list);
      console.log(`🍪 Got ${list.length} cookies from ${d}`);
    } catch (err) {
      console.warn(`⚠️ Failed to get cookies from ${d}:`, err);
    }
  }
  console.log(`🍪 Total cookies collected: ${allCookies.length}`);
  return allCookies;
}

function cookiesToNetscape(cookies: any[]): string {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const c of cookies) {
    const domainRaw = c.domain || "";
    const domain = domainRaw
      ? domainRaw.startsWith(".")
        ? domainRaw
        : `.${domainRaw}`
      : "";
    const includeSub = c.hostOnly ? "FALSE" : "TRUE";
    const path = c.path || "/";
    const secure = c.secure ? "TRUE" : "FALSE";
    const expiry = c.expirationDate
      ? Math.floor(c.expirationDate)
      : Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    const name = c.name || "";
    const value = c.value || "";
    lines.push(
      [domain, includeSub, path, secure, expiry, name, value].join("\t")
    );
  }
  return lines.join("\n");
}

// ----------------------------
chrome.runtime.onMessage.addListener(
  (msg: any, sender: any, sendResponse?: (response?: any) => void) => {
    console.log("📨 Background received:", msg?.type, "from:", sender?.tab?.id);
    console.log("📨 Background received:", msg?.type, "from:", sender?.tab?.id);

    // درخواست فرستادن کوکی‌ها به سرور
    if (msg?.type === "REQUEST_UPLOAD_COOKIES") {
      (async () => {
        try {
          if (!sender.tab?.url) {
            throw new Error("No tab URL available");
          }
          const cookies = await getAllYouTubeCookies();
          const cookieTxt = cookiesToNetscape(cookies);

          const res = await fetch("http://localhost:3000/upload-cookies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cookies: cookieTxt }),
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

          const j = await res.json();
          console.log("✅ Cookies uploaded:", j);
          sendResponse && sendResponse({ ok: true, server: j });
          sendToPopups({ type: "STATUS", status: "cookies_uploaded" });
        } catch (err) {
          console.error("❌ Cookie upload failed:", err);
          sendResponse && sendResponse({ ok: false, error: String(err) });
        }
      })();
      return true; // Async response
    }

    // فعال‌سازی زیرنویس (فقط اگر لازم – manifest خودش inject می‌کنه، اما برای dynamic tabs)
    if (msg?.type === "ACTIVATE_PERSIAN_SUBS") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
        if (!tabs[0]?.id) {
          console.warn("⚠️ No active tab found");
          return;
        }
        const tabId = tabs[0].id;

        // Inject JS و CSS اگر قبلاً inject نشده (fallback)
        chrome.scripting
          .executeScript({
            target: { tabId },
            files: ["content/addCaptionButton.js", "content/captions.js"],
          })
          .then(() => console.log("✅ Scripts injected"))
          .catch((e: any) => console.error("❌ executeScript failed:", e));

        chrome.scripting
          .insertCSS({
            target: { tabId },
            files: ["content/captions.css"],
          })
          .then(() => console.log("✅ CSS injected"))
          .catch((e: any) => console.error("❌ insertCSS failed:", e));

        // Forward به content (با wrapper امن)
        safeSendMessage(tabId, msg);
      });
    }

    // ارسال یک زیرنویس ساده (متن ثابت) به content script
    if (msg?.type === "SHOW_PERSIAN_SUB") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
        if (!tabs[0]?.id) return;
        const tabId = tabs[0].id;
        safeSendMessage(tabId, {
          type: "SHOW_PERSIAN_SUB",
          text: msg.text,
        });
      });
    }

    // ارسال زیرنویس‌های زمان‌بندی‌شده (آرایه {start,end,text})
    if (msg?.type === "SHOW_TIMED_SUBS") {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any) => {
        if (!tabs[0]?.id) return;
        const tabId = tabs[0].id;
        safeSendMessage(tabId, {
          type: "SHOW_TIMED_SUBS",
          captions: msg.captions,
        });
      });
    }

    // درخواست زیرنویس از سرور (preload/translate)
    if (msg?.type === "REQUEST_PERSIAN_SUBS") {
      console.log("🎬 Received subtitle request for:", msg.url);

      (async () => {
        try {
          // درخواست به سرور (هماهنگ با addCaptionButton: /preload)
          const res = await fetch("http://localhost:3000/preload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: msg.url }),
          });

          if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

          const data = await res.json();
          if (!data.success) throw new Error(data.error || "Server error");

          console.log("✅ Translation received:", data);
          sendToPopups({ type: "TRANSCRIPT", text: data.persian || "No text" });

          if (sender?.tab?.id) {
            safeSendMessage(sender.tab.id, {
              type: "SHOW_TIMED_SUBS",
              captions: data.englishSegments || [
                { start: 0, end: 9999, text: data.persian },
              ],
            });
          } else {
            console.warn("⚠️ No sender tab id to send captions");
          }
        } catch (err) {
          console.error("🚨 Error fetching subtitles:", err);
          sendToPopups({ type: "STATUS", status: "error", error: String(err) });
        }
      })();
      return true; // Async
    }

    // Forward audio chunks به popup
    if (msg?.type === "AUDIO_CHUNK") {
      sendToPopups(msg);
    }

    // وضعیت capture
    if (msg?.type === "STATUS") {
      sendToPopups(msg);
    }

    // Default response
    try {
      sendResponse && sendResponse({ ok: true });
    } catch (e) {
      console.warn("⚠️ sendResponse failed:", e);
    }
  }
);

// Dynamic inject برای یوتیوب (وقتی tab update شد)
chrome.tabs.onUpdated.addListener((tabId: any, changeInfo: any, tab: any) => {
  if (
    changeInfo.status === "complete" &&
    tab.url?.includes("youtube.com/watch")
  ) {
    console.log("🔄 YouTube tab updated, injecting scripts:", tabId);
    chrome.scripting
      .executeScript({
        target: { tabId },
        files: [
          "content/addCaptionButton.js",
          "content/captions.js",
          "content/index.js",
        ],
      })
      .catch((e: any) => console.error("❌ Dynamic inject failed:", e));
  }
});
// ...existing code...
