if (window.__FARSI_ADD_BTN_LOADED__) {
  console.log(
    "⏩ addCaptionButton.js already loaded, skipping duplicate injection."
  );
} else {
  window.__FARSI_ADD_BTN_LOADED__ = true;
  window.FarsiSubtitle = window.FarsiSubtitle || {};

  console.log("🎛️ addCaptionButton loaded and watching for CC alignment.");

  // 🧠 بررسی اینکه کاربر لاگین است یا خیر
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

  // ✅ گرفتن userId از حافظه
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

  async function fetchCaptionsOnceForVideo(
    url,
    btn,
    svgActive,
    svgError,
    svgDefault
  ) {
    try {
      const userId = await getUserId();

      document.dispatchEvent(
        new CustomEvent("farsi-show-timed", {
          detail: {
            captions: [
              {
                start: 0,
                end: 9999,
                text: "لطفاً بین ۱ تا ۲ دقیقه صبر کنید، زیرنویس در حال آماده‌سازی است...",
              },
            ],
          },
        })
      );
      btn.innerHTML = svgActive;

      const resp = await fetch("http://localhost:3000/preload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, userId }),
      });

      const data = await resp.json();

      if (data?.usage) {
        safeSendToBackground({
          type: "UPDATE_USAGE",
          usage: data.usage,
        });
      }

      if (!data?.success)
        throw new Error(data?.error || "server returned no success");

      const captions = data.captions?.length
        ? data.captions
        : data.englishSegments?.length
        ? data.englishSegments
        : [
            {
              start: 0,
              end: 9999,
              text: data.persian || data.fullText || "No subtitles",
            },
          ];

      window.__farsiCachedCaptions = captions;
      window.__farsiDownloadedForVideo = true;
      window.__farsiSubsActive = true;

      safeSendToBackground({ type: "SHOW_TIMED_SUBS", captions });
      document.dispatchEvent(
        new CustomEvent("farsi-show-timed", { detail: { captions } })
      );

      btn.title = "زیرنویس فارسی: روشن (کلیک برای قطع)";
      btn.innerHTML = svgActive;
    } catch (err) {
      console.error("❌ preload failed:", err);
      btn.innerHTML = svgError;
      setTimeout(() => (btn.innerHTML = svgDefault), 3500);
      window.__farsiDownloadedForVideo = false;
      window.__farsiSubsActive = false;
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
    btn.title = "فعال‌سازی زیرنویس فارسی (FA)";
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

    const svgDefault = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="rgba(255,255,255,0.12)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;
    const svgActive = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="rgba(0,170,255,0.48)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;
    const svgError = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="rgba(255,0,0,0.48)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;

    btn.innerHTML = svgDefault;

    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "0.95"));

    btn.addEventListener("click", async () => {
      const videoId = new URL(location.href).searchParams.get("v");
      if (!window.__farsiDownloadedForVideo) {
        btn.style.transform = "scale(1.06)";
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

    const uiObserver = new MutationObserver(() => {
      const ccButton = document.querySelector(
        ".ytp-subtitles-button, .ytp-subtitle-button"
      );
      if (ccButton && !btn.parentNode) tryInsertNextToCC();
    });
    uiObserver.observe(document.body, { childList: true, subtree: true });

    return btn;
  }

  let lastVideoId = new URL(location.href).searchParams.get("v");
  const navObserver = new MutationObserver(() => {
    const currentId = new URL(location.href).searchParams.get("v");
    if (currentId !== lastVideoId) {
      console.log("🎬 Video changed:", lastVideoId, "→", currentId);
      lastVideoId = currentId;
      window.__farsiCachedCaptions = null;
      window.__farsiDownloadedForVideo = false;
      window.__farsiSubsActive = false;
      safeSendToBackground({ type: "TOGGLE_PERSIAN_SUBS" });
      document.dispatchEvent(new CustomEvent("farsi-toggle-hide"));
      const btn = document.getElementById("farsi-caption-btn");
      if (btn)
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="rgba(255,255,255,0.12)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  document.addEventListener("fullscreenchange", () => {
    const btn = document.getElementById("farsi-caption-btn");
    if (!btn) return;

    if (document.fullscreenElement) {
      btn.style.transform = "translateY(-6px)";
    } else {
      btn.style.transform = "";
    }
  });

  setTimeout(() => createCaptionButton(false), 600);
}
