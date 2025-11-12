if (window.__FARSI_INDEX_LOADED__) {
  console.log("⏩ content/index.js already loaded.");
} else {
  window.__FARSI_INDEX_LOADED__ = true;
  console.log("🎬 YouTube STT content script loaded");

  async function getUserId() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["userId"], (res) => {
        let userId = res.userId;
        if (!userId) {
          userId = crypto.randomUUID();
          chrome.storage.local.set({ userId });
        }
        resolve(userId);
      });
    });
  }

  async function uploadCookiesToServer() {
    const userId = await getUserId();
    chrome.runtime.sendMessage(
      { type: "REQUEST_UPLOAD_COOKIES", userId },
      (response) => {
        if (response?.ok) {
          console.log("✅ Cookies uploaded successfully:", response.server);
        } else {
          console.warn("⚠️ Cookie upload failed:", response?.error);
        }
      }
    );
  }

  // 🧠 تشخیص تغییر ویدیو با MutationObserver به‌جای setInterval
  let lastVideoId = new URL(location.href).searchParams.get("v");

  const observer = new MutationObserver(() => {
    const currentId = new URL(location.href).searchParams.get("v");
    if (currentId && currentId !== lastVideoId) {
      lastVideoId = currentId;
      console.log("🎥 New video detected:", location.href);
      uploadCookiesToServer();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // بار اول
  uploadCookiesToServer();
}
