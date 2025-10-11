// src/background/index.ts
console.log("🧠 Background service worker loaded");

let popupPorts: chrome.runtime.Port[] = [];

// ----------------------------
// 🔌 اتصال به popup (logger)
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup-logger") {
    popupPorts.push(port);
    console.log("🔌 Popup connected:", popupPorts.length);
    port.onDisconnect.addListener(() => {
      popupPorts = popupPorts.filter((p) => p !== port);
      console.log("🔌 Popup disconnected:", popupPorts.length);
    });

    // ارسال وضعیت اولیه به popup
    port.postMessage({ type: "STATUS", status: "idle" });
  }
});

// Helper: ارسال پیام به همه popupها
function sendToPopups(msg: any) {
  popupPorts.forEach((port) => {
    if (port) port.postMessage(msg);
  });
}

// ----------------------------
// 🍪 گرفتن کوکی‌های یوتیوب (از چند زیر دامنه)
async function getAllYouTubeCookies(): Promise<chrome.cookies.Cookie[]> {
  const domains = [".youtube.com", ".www.youtube.com", ".accounts.youtube.com"];
  let allCookies: chrome.cookies.Cookie[] = [];
  for (const d of domains) {
    try {
      const list = await new Promise<chrome.cookies.Cookie[]>((resolve) => {
        chrome.cookies.getAll({ domain: d }, (ck) => resolve(ck || []));
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

function cookiesToNetscape(cookies: chrome.cookies.Cookie[]): string {
  const lines = ["# Netscape HTTP Cookie File"];
  for (const c of cookies) {
    const domain = c.domain.startsWith(".") ? c.domain : `.${c.domain}`;
    const includeSub = c.hostOnly ? "FALSE" : "TRUE";
    const path = c.path || "/";
    const secure = c.secure ? "TRUE" : "FALSE";
    const expiry = c.expirationDate
      ? Math.floor(c.expirationDate)
      : Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    const name = c.name;
    const value = c.value;
    lines.push(
      [domain, includeSub, path, secure, expiry, name, value].join("\t")
    );
  }
  return lines.join("\n");
}

// ----------------------------
// 🎧 دریافت و پاسخ به پیام‌ها
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("📨 Background received:", msg.type, "from:", sender.tab?.id);

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
        sendResponse({ ok: true, server: j });
        sendToPopups({ type: "STATUS", status: "cookies_uploaded" });
      } catch (err) {
        console.error("❌ Cookie upload failed:", err);
        sendResponse({ ok: false, error: String(err) });
      }
    })();
    return true; // Async response
  }

  // فعال‌سازی زیرنویس (فقط اگر لازم – manifest خودش inject می‌کنه، اما برای dynamic tabs)
  if (msg?.type === "ACTIVATE_PERSIAN_SUBS") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
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
        .catch((e) => console.error("❌ executeScript failed:", e));

      chrome.scripting
        .insertCSS({
          target: { tabId },
          files: ["content/captions.css"],
        })
        .then(() => console.log("✅ CSS injected"))
        .catch((e) => console.error("❌ insertCSS failed:", e));

      // Forward به content
      chrome.tabs
        .sendMessage(tabId, msg)
        .catch((e) => console.error("❌ Send message failed:", e));
    });
  }

  // ارسال یک زیرنویس ساده (متن ثابت) به content script
  if (msg?.type === "SHOW_PERSIAN_SUB") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return;
      chrome.tabs
        .sendMessage(tabs[0].id, {
          type: "SHOW_PERSIAN_SUB",
          text: msg.text,
        })
        .catch((e) => console.error("❌ Send sub failed:", e));
    });
  }

  // ارسال زیرنویس‌های زمان‌بندی‌شده (آرایه {start,end,text})
  if (msg?.type === "SHOW_TIMED_SUBS") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]?.id) return;
      chrome.tabs
        .sendMessage(tabs[0].id, {
          type: "SHOW_TIMED_SUBS",
          captions: msg.captions,
        })
        .catch((e) => console.error("❌ Send timed subs failed:", e));
    });
  }

  // درخواست زیرنویس از سرور (preload/translate)
  if (msg.type === "REQUEST_PERSIAN_SUBS") {
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
          chrome.tabs.sendMessage(sender.tab.id, {
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
  if (msg.type === "AUDIO_CHUNK") {
    sendToPopups(msg);
  }

  // وضعیت capture
  if (msg.type === "STATUS") {
    sendToPopups(msg);
  }

  // Default response
  try {
    sendResponse?.({ ok: true });
  } catch (e) {
    console.warn("⚠️ sendResponse failed:", e);
  }
});

// Dynamic inject برای یوتیوب (وقتی tab update شد)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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
      .catch((e) => console.error("❌ Dynamic inject failed:", e));
  }
});
