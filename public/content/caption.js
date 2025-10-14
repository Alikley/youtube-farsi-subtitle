// 🎬 Persian Caption Renderer (Synced with YouTube Video)
// Injected by addCaptionButton.js

let captionsData = [];
let currentSubtitle = null;
let subBox = null;
let checkInterval = null;

/**
 * نمایش یا به‌روزرسانی زیرنویس روی ویدیو
 */
function showSubtitle(text) {
  if (!subBox) return;
  subBox.textContent = text;
  subBox.style.display = "block";
  subBox.style.opacity = "1";
}

/**
 * پنهان کردن زیرنویس
 */
function hideSubtitle() {
  if (!subBox) return;
  subBox.style.opacity = "0";
  setTimeout(() => {
    if (subBox && subBox.style.opacity === "0") subBox.style.display = "none";
  }, 300);
}

/**
 * اضافه کردن باکس زیرنویس به صفحه
 */
function ensureSubtitleBox() {
  if (subBox) return subBox;

  subBox = document.createElement("div");
  subBox.id = "fa-sub-box";
  Object.assign(subBox.style, {
    position: "absolute",
    bottom: "10%",
    width: "100%",
    textAlign: "center",
    fontSize: "22px",
    fontWeight: "600",
    color: "#fff",
    textShadow: "0 0 8px #000, 0 0 4px #000",
    zIndex: "999999999",
    background: "rgba(0,0,0,0.25)",
    padding: "4px 10px",
    borderRadius: "8px",
    display: "none",
    opacity: "0",
    transition: "opacity 0.2s ease-in-out",
    pointerEvents: "none",
  });

  const container =
    document.querySelector(".html5-video-player") ||
    document.querySelector("#movie_player") ||
    document.body;

  container.appendChild(subBox);
  console.log("🆗 Subtitle box injected");
  return subBox;
}

/**
 * شروع نمایش زمان‌بندی شده‌ی زیرنویس‌ها
 */
function startCaptions(subs) {
  captionsData = subs;
  if (!Array.isArray(captionsData) || captionsData.length === 0) {
    console.error("❌ No subtitles to display.");
    return;
  }

  ensureSubtitleBox();
  const video = document.querySelector("video");

  if (!video) {
    console.error("🎥 No <video> element found!");
    return;
  }

  if (checkInterval) clearInterval(checkInterval);

  checkInterval = setInterval(() => {
    const t = video.currentTime;
    const seg = captionsData.find((s) => t >= s.start && t <= s.end);

    if (seg && seg.text !== currentSubtitle) {
      currentSubtitle = seg.text;
      showSubtitle(currentSubtitle);
    } else if (!seg && currentSubtitle !== null) {
      currentSubtitle = null;
      hideSubtitle();
    }
  }, 200);

  console.log(`🎯 Captions started (${captionsData.length} segments).`);

  // ذخیره‌ی آخرین زیرنویس برای ادامه هنگام Play دوباره
  window.__farsiCachedCaptions = captionsData;
}

/**
 * توقف نمایش زیرنویس‌ها
 */
function stopCaptions() {
  if (checkInterval) clearInterval(checkInterval);
  hideSubtitle();
  currentSubtitle = null;
  console.log("🛑 Captions stopped.");
}

/**
 * گوش دادن به وضعیت ویدیو (pause / play)
 */
function setupVideoListeners() {
  const video = document.querySelector("video");
  if (!video) return;

  video.addEventListener("pause", () => {
    console.log("⏸ Video paused — hiding captions");
    hideSubtitle();
  });

  video.addEventListener("play", () => {
    console.log("▶️ Video playing — resuming captions");
    if (
      window.__farsiCachedCaptions &&
      window.__farsiCachedCaptions.length > 0
    ) {
      startCaptions(window.__farsiCachedCaptions);
    }
  });
}

/**
 * ✅ گوش دادن به پیام‌هایی که از addCaptionButton ارسال می‌شوند
 */
window.addEventListener("farsi-show-timed", (ev) => {
  const captions = ev.detail?.captions;
  console.log(
    "📩 farsi-show-timed event received:",
    captions?.length,
    "segments"
  );
  if (captions && captions.length > 0) {
    startCaptions(captions);
  } else {
    console.error("⚠️ No captions found in event detail");
  }
});

/**
 * ✅ پشتیبانی از fallback postMessage
 */
window.addEventListener("message", (ev) => {
  if (ev?.data?.__farsi_ext && ev.data?.payload?.type === "SHOW_TIMED_SUBS") {
    const captions = ev.data.payload.captions;
    console.log(
      "📩 postMessage SHOW_TIMED_SUBS received:",
      captions?.length,
      "segments"
    );
    if (captions && captions.length > 0) {
      startCaptions(captions);
    }
  }
});

setupVideoListeners();
console.log("📜 caption.js loaded and listening for subtitles...");
