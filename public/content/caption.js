if (window.__FARSI_CAPTION_LOADED__) {
  console.log("⏩ caption.js already loaded, skipping duplicate injection.");
} else {
  window.__FARSI_CAPTION_LOADED__ = true;
  window.FarsiSubtitle = window.FarsiSubtitle || {};

  let captionsData = [];
  let currentSubtitle = null;
  let subBox = null;
  let checkInterval = null;
  let loadingMode = false;

  /** اصلاح سبک و تمیزکردن فاصله‌ها فقط برای ظاهر */
  function tidyText(text) {
    return text
      .replace(/\s{2,}/g, " ") // فاصله‌های دوبل
      .replace(/\s+([.,!?،؛:])/g, "$1") // فاصله قبل از علائم
      .replace(/([.,!?،؛:])([^\s])/g, "$1 $2") // فاصله بعد از علائم
      .trim();
  }

  /** نمایش یا به‌روزرسانی زیرنویس روی ویدیو */
  function showSubtitle(text, persistent = false) {
    ensureSubtitleBox();
    subBox.textContent = tidyText(text);
    subBox.style.display = "block";
    subBox.style.opacity = "1";
    if (persistent) loadingMode = true;
  }

  /** پنهان کردن زیرنویس */
  function hideSubtitle() {
    if (!subBox || loadingMode) return;
    subBox.style.opacity = "0";
    setTimeout(() => {
      if (subBox && subBox.style.opacity === "0") subBox.style.display = "none";
    }, 300);
  }

  /** اضافه کردن باکس زیرنویس به صفحه */
  function ensureSubtitleBox() {
    if (subBox) return subBox;
    subBox = document.createElement("div");
    subBox.id = "fa-sub-box";
    Object.assign(subBox.style, {
      position: "absolute",
      bottom: "8%",
      width: "100%",
      textAlign: "center",
      fontSize: "20px",
      fontWeight: "600",
      color: "#fff",
      textShadow: "0 0 6px #000, 0 0 2px #000",
      zIndex: "999999999",
      background: "rgba(0,0,0,0.35)",
      padding: "6px 12px",
      borderRadius: "10px",
      display: "none",
      opacity: "0",
      transition: "opacity 0.25s ease-in-out",
      pointerEvents: "none",
      fontFamily: "Vazir, sans-serif",
      direction: "rtl",
    });
    const container =
      document.querySelector(".html5-video-player") ||
      document.querySelector("#movie_player") ||
      document.body;
    container.appendChild(subBox);
    console.log("🆗 Subtitle box injected");
    return subBox;
  }

  /** شروع نمایش زمان‌بندی‌شده‌ی زیرنویس‌ها */
  function startCaptions(subs) {
    if (
      subs?.length === 1 &&
      subs[0].text.includes("زیرنویس در حال آماده‌سازی است")
    ) {
      showSubtitle(subs[0].text, true);
      return;
    }

    captionsData = subs;
    if (!Array.isArray(captionsData) || captionsData.length === 0) {
      console.error("❌ No subtitles to display.");
      return;
    }

    loadingMode = false;
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
    window.__farsiCachedCaptions = captionsData;
  }

  /** توقف نمایش زیرنویس‌ها */
  function stopCaptions() {
    if (checkInterval) clearInterval(checkInterval);
    if (!loadingMode) hideSubtitle();
    currentSubtitle = null;
    console.log("🛑 Captions stopped.");
  }

  /** گوش دادن به وضعیت ویدیو (pause / play) */
  function setupVideoListeners() {
    const video = document.querySelector("video");
    if (!video) return;
    video.addEventListener("pause", () => {
      if (!loadingMode) hideSubtitle();
    });
    video.addEventListener("play", () => {
      if (!loadingMode && window.__farsiCachedCaptions?.length > 0) {
        startCaptions(window.__farsiCachedCaptions);
      }
    });
  }

  document.addEventListener("farsi-show-timed", (ev) => {
    const captions = ev.detail?.captions;
    if (captions && captions.length > 0) startCaptions(captions);
  });

  document.addEventListener("message", (ev) => {
    if (ev?.data?.__farsi_ext && ev.data?.payload?.type === "SHOW_TIMED_SUBS") {
      const captions = ev.data.payload.captions;
      if (captions && captions.length > 0) startCaptions(captions);
    }
  });

  document.addEventListener("farsi-toggle-hide", () => {
    loadingMode = false;
    stopCaptions();
  });

  setupVideoListeners();
  console.log("📜 caption.js loaded and listening for subtitles...");
}
