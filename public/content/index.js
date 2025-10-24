if (window.__FARSI_ADD_BTN_LOADED__) {
  console.log(
    "⏩ addCaptionButton.js already loaded, skipping duplicate injection."
  );
} else {
  window.__FARSI_ADD_BTN_LOADED__ = true;
  window.FarsiSubtitle = window.FarsiSubtitle || {};

  console.log("🎬 YouTube STT content script loaded");

  // 🔹 ارسال کوکی‌ها به سرور
  function uploadCookiesToServer() {
    chrome.runtime.sendMessage(
      { type: "REQUEST_UPLOAD_COOKIES" },
      (response) => {
        if (response?.ok) {
          console.log("✅ Cookies uploaded successfully:", response.server);
        } else {
          console.warn("⚠️ Cookie upload failed:", response?.error);
        }
      }
    );
  }

  // 🔁 وقتی ویدئو عوض شد، کوکی جدید بفرست
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.log("🎥 New video detected:", lastUrl);
      uploadCookiesToServer();
    }
  }, 3000);

  // بار اول هم بفرست
  uploadCookiesToServer();
}
