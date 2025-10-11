import { captureYouTubeAudio } from "./audioCapture";

console.log("🎬 YouTube STT content script loaded");

// 🔹 ارسال کوکی‌ها به سرور
function uploadCookiesToServer() {
  chrome.runtime.sendMessage({ type: "REQUEST_UPLOAD_COOKIES" }, (response) => {
    if (response?.ok) {
      console.log("✅ Cookies uploaded successfully:", response.server);
    } else {
      console.warn("⚠️ Cookie upload failed:", response?.error);
    }
  });
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

// 🎧 شروع ضبط صدا
function tryStartCapture() {
  const video = document.querySelector("video") as HTMLVideoElement | null;
  if (video) {
    captureYouTubeAudio();
  } else {
    console.log("No video yet, retrying...");
    setTimeout(tryStartCapture, 2000);
  }
}

window.addEventListener("load", tryStartCapture);
tryStartCapture();


