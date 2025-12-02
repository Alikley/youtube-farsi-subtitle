if (window.__FARSI_ADD_BTN_LOADED__) {
  console.log(
    "⏩ addCaptionButton.js already loaded, skipping duplicate injection."
  );
} else {
  window.__FARSI_ADD_BTN_LOADED__ = true;
  window.FarsiSubtitle = window.FarsiSubtitle || {};

  console.log("🎛️ addCaptionButton loaded and watching for CC alignment.");
  const API_BASE_URL = "https://alikley933-navak.hf.space";
  const POLL_INTERVAL = 5000; // 5 ثانیه
  let uiObserver = null;
  let navObserver = null;

  function isUserLoggedIn() {
    const signInBtn = document.querySelector(
      "ytd-button-renderer.style-suggestive[href*='ServiceLogin']"
    );
    const avatarBtn = document.querySelector(
      "ytd-topbar-menu-button-renderer button#avatar-btn"
    );
    if (signInBtn) return false;
    if (avatarBtn) return true;
    return null;
  }

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

  function waitForControls(timeoutMs = 10000) {
    const start = Date.now();
    return new Promise((resolve) => {
      (function check() {
        const selectors = [
          ".ytp-right-controls",
          "#movie_player .ytp-right-controls",
          ".ytp-chrome-controls .ytp-right-controls",
        ];
        let controls = null;
        for (const s of selectors) {
          controls = document.querySelector(s);
          if (controls) break;
        }
        if (controls) return resolve(controls);
        if (Date.now() - start > timeoutMs) return resolve(null);
        requestAnimationFrame(check);
      })();
    });
  }

  function safeSendToBackground(message) {
    try {
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage(message);
        return;
      }
    } catch {}
    window.postMessage({ __farsi_ext: true, payload: message }, "*");
  }

  async function startPolling(
    jobId,
    btn,
    svgActive,
    svgError,
    svgDefault,
    resolve
  ) {
    // 💡 نمایش وضعیت اولیه (در حال پردازش)
    btn.innerHTML = svgActive;
    btn.title = "زیرنویس فارسی: در حال پردازش...";

    const pollingCheck = async () => {
      const response = await new Promise((res, rej) => {
        // 🎯 ارسال پیام به Background Service Worker برای چک کردن وضعیت
        chrome.runtime.sendMessage(
          {
            type: "REQUEST_JOB_STATUS",
            jobId: jobId,
          },
          (resp) => {
            if (resp.success) {
              res(resp.data);
            } else {
              rej(resp.error || "Failed to get status from server.");
            }
          }
        );
      });

      const status = response.status;

      if (status === "COMPLETED") {
        clearInterval(window.__farsiPollingInterval);
        console.log("✅ Job Completed!");

        // 💰 به‌روزرسانی مصرف باید در اینجا انجام شود (با فرض اینکه سرور مقدار استفاده شده را برمی‌گرداند)
        // چون سرور شما فقط مصرف مجاز را در start-job چک می‌کند، باید logic addUserUsage در jobProcessor.js نهایی شود.

        const captions = response.captions || [];

        // 💡 نمایش موفقیت
        btn.title = "زیرنویس فارسی: روشن (کلیک برای قطع)";
        btn.innerHTML = svgActive;

        // Resolve promise و بازگرداندن زیرنویس‌ها
        resolve({ captions: captions });
        return;
      } else if (status === "FAILED") {
        clearInterval(window.__farsiPollingInterval);
        console.error("❌ Job Failed. Error:", response.error);
        // 💡 نمایش خطا
        btn.innerHTML = svgError;
        setTimeout(() => (btn.innerHTML = svgDefault), 3500);
        resolve({ error: response.error });
        return;
      } else {
        console.log(`⏳ Job ${jobId} status: ${status}. Polling...`);
        // ادامه Polling
      }
    };

    // شروع Polling
    window.__farsiPollingInterval = setInterval(pollingCheck, POLL_INTERVAL);
    // اجرای فوری برای جلوگیری از تأخیر اولیه
    pollingCheck();
  }

  async function fetchCaptionsOnceForVideo(
    url,
    btn,
    svgActive,
    svgError,
    svgDefault
  ) {
    try {
      const userId = await getUserId();
      const videoDuration = document.querySelector("video")?.duration || 0; // 💡 دریافت مدت زمان ویدیو

      // 💡 نمایش پیام اولیه
      document.dispatchEvent(
        new CustomEvent("farsi-show-timed", {
          detail: {
            captions: [
              {
                start: 0,
                end: 9999,
                text: "لطفاً بین ۱ تا ۵ دقیقه صبر کنید، زیرنویس در حال آماده‌سازی است...",
              },
            ],
          },
        })
      );
      btn.innerHTML = svgActive;

      // ۱. ارسال درخواست شروع کار (REQUEST_START_JOB)
      const startResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "REQUEST_START_JOB",
            videoUrl: url,
            userId: userId,
            videoDuration: videoDuration,
          },
          resolve
        );
      });

      if (!startResponse.success || startResponse.status !== 202) {
        const error =
          startResponse.data?.error ||
          startResponse.error ||
          "Failed to start job.";
        throw new Error(error);
      }

      const jobId = startResponse.data.jobId;
      console.log(`✅ Job started with ID: ${jobId}`);

      // ۲. شروع Polling و انتظار برای نتیجه
      const jobResult = await new Promise((resolve) => {
        // شروع Polling در تابع جدید
        startPolling(jobId, btn, svgActive, svgError, svgDefault, resolve);
      });

      // ۳. پردازش نتیجه
      if (jobResult.error) {
        throw new Error(jobResult.error);
      }

      const captions = jobResult.captions;
      if (!captions || captions.length === 0) {
        throw new Error("No captions returned.");
      }

      // ۴. ذخیره و نمایش زیرنویس‌ها
      window.__farsiCachedCaptions = captions;
      window.__farsiDownloadedForVideo = true;
      window.__farsiSubsActive = true;

      safeSendToBackground({ type: "SHOW_TIMED_SUBS", captions });
      document.dispatchEvent(
        new CustomEvent("farsi-show-timed", { detail: { captions } })
      );
    } catch (err) {
      console.error("❌ Job processing failed:", err);
      btn.innerHTML = svgError;
      setTimeout(() => (btn.innerHTML = svgDefault), 3500);
      window.__farsiDownloadedForVideo = false;
      window.__farsiSubsActive = false;

      // نمایش خطای نهایی به کاربر
      document.dispatchEvent(
        new CustomEvent("farsi-show-timed", {
          detail: {
            captions: [{ start: 0, end: 9999, text: `❌ خطا: ${err.message}` }],
          },
        })
      );
    }
  }

  async function createCaptionButton() {
    const loggedIn = isUserLoggedIn();
    if (loggedIn === false) {
      console.warn("🚫 User not logged in — disabling Farsi button.");
      return;
    }

    const controls = await waitForControls();
    if (!controls)
      console.warn(
        "⚠️ Controls not found, appending button to body as fallback"
      );

    let existing = document.getElementById("farsi-caption-btn");
    if (existing) {
      existing.style.display = "";
      return existing;
    }

    const btn = document.createElement("button");
    btn.id = "farsi-caption-btn";
    btn.title = "فعال‌سازی زیرنویس فارسی ";
    btn.className = "farsi-caption-btn-custom";

    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
      cursor: "pointer",
      opacity: "0.95",
      transition: "opacity 0.14s ease, transform 0.14s ease",
      marginLeft: "4px",
      background: "transparent",
      border: "none",
      padding: "0",
      zIndex: 999999,
    });

    const svgDefault = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(255,255,255,0.12)" /><text x="7" y="17" font-size="12" font-weight="bold" fill="white" font-family="Arial, sans-serif">N</text></svg>`;
    const svgActive = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(0,170,255,0.48)" /><text x="7" y="17" font-size="12" font-weight="bold" fill="white" font-family="Arial, sans-serif">N</text></svg>`;
    const svgError = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="rgba(255,0,0,0.48)" /><text x="7" y="17" font-size="12" font-weight="bold" fill="white" font-family="Arial, sans-serif">N</text></svg>`;

    btn.innerHTML = svgDefault;

    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "0.95"));

    btn.addEventListener("click", async () => {
      const videoId = new URL(location.href).searchParams.get("v");
      if (!window.__farsiDownloadedForVideo) {
        btn.style.transform = "scale(1.2)";
        await fetchCaptionsOnceForVideo(
          location.href,
          btn,
          svgActive,
          svgError,
          svgDefault
        );
        setTimeout(() => (btn.style.transform = ""), 120);
        return;
      }

      window.__farsiSubsActive = !window.__farsiSubsActive;
      if (window.__farsiSubsActive) {
        safeSendToBackground({
          type: "SHOW_TIMED_SUBS",
          captions: window.__farsiCachedCaptions,
        });
        btn.innerHTML = svgActive;
      } else {
        safeSendToBackground({ type: "TOGGLE_PERSIAN_SUBS" });
        document.dispatchEvent(new CustomEvent("farsi-toggle-hide"));
        btn.innerHTML = svgDefault;
      }
    });

    const tryInsertNextToCC = () => {
      const ccButton = document.querySelector(
        ".ytp-subtitles-button, .ytp-subtitle-button, [aria-label*='Subtitles'], [aria-label*='زیرنویس']"
      );
      if (ccButton && ccButton.parentNode && !btn.parentNode) {
        ccButton.parentNode.insertBefore(btn, ccButton.nextSibling);
        console.log("✅ FA button inserted next to CC");
      }
    };

    tryInsertNextToCC();

    if (uiObserver) uiObserver.disconnect();
    uiObserver = new MutationObserver(() => {
      const ccButton = document.querySelector(
        ".ytp-subtitles-button, .ytp-subtitle-button"
      );
      if (ccButton && !btn.parentNode) tryInsertNextToCC();
    });
    uiObserver.observe(document.body, { childList: true, subtree: true });

    return btn;
  }

  let lastVideoId = new URL(location.href).searchParams.get("v");
  if (navObserver) navObserver.disconnect();
  navObserver = new MutationObserver(() => {
    const currentId = new URL(location.href).searchParams.get("v");
    if (currentId !== lastVideoId) {
      console.log("🎬 Video changed:", lastVideoId, "→", currentId);
      lastVideoId = currentId;
      if (uiObserver) uiObserver.disconnect();
      window.__farsiCachedCaptions = null;
      window.__farsiDownloadedForVideo = false;
      window.__farsiSubsActive = false;
      safeSendToBackground({ type: "TOGGLE_PERSIAN_SUBS" });
      document.dispatchEvent(new CustomEvent("farsi-toggle-hide"));
      const btn = document.getElementById("farsi-caption-btn");
      if (btn)
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="rgba(255,255,255,0.12)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;
      setTimeout(() => createCaptionButton(), 400);
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("fullscreenchange", () => {
    const btn = document.getElementById("farsi-caption-btn");
    if (!btn) return;
    btn.style.transform = document.fullscreenElement ? "translateY(-6px)" : "";
  });

  setTimeout(() => createCaptionButton(false), 600);
}
