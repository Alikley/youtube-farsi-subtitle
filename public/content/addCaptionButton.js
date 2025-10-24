if (window.__FARSI_ADD_BTN_LOADED__) {
  console.log(
    "⏩ addCaptionButton.js already loaded, skipping duplicate injection."
  );
} else {
  window.__FARSI_ADD_BTN_LOADED__ = true;
  window.FarsiSubtitle = window.FarsiSubtitle || {};

  console.log("🎛️ addCaptionButton loaded (one-shot download + toggle)");

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
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.sendMessage
      ) {
        chrome.runtime.sendMessage(message);
        return;
      }
    } catch (e) {
      // ignore
    }
    // fallback
    window.postMessage({ __farsi_ext: true, payload: message }, "*");
  }

  function ensureContainerAppend(node) {
    const selectors = [
      ".ytp-right-controls",
      "#movie_player .ytp-right-controls",
      ".ytp-chrome-controls .ytp-right-controls",
      ".ytp-left-controls",
    ];
    for (const s of selectors) {
      const c = document.querySelector(s);
      if (c) {
        c.appendChild(node);
        return true;
      }
    }
    document.body.appendChild(node);
    return false;
  }

  function getVideoIdFromUrl(url = location.href) {
    try {
      return new URL(url).searchParams.get("v") || null;
    } catch {
      return null;
    }
  }

  async function fetchCaptionsOnceForVideo(
    url,
    btn,
    svgActive,
    svgError,
    svgDefault
  ) {
    // perform /preload once and set global cache
    try {
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
        body: JSON.stringify({ url }),
      });
      const data = await resp.json();
      if (!data || !data.success)
        throw new Error(data?.error || "server returned no success");

      const captions =
        data.captions && Array.isArray(data.captions) && data.captions.length
          ? data.captions
          : data.englishSegments && data.englishSegments.length
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

      // send to background and local listener
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
      // ensure flags
      window.__farsiDownloadedForVideo = false;
      window.__farsiSubsActive = false;
    }
  }

  async function createCaptionButton() {
    const controls = await waitForControls();
    if (!controls)
      console.warn(
        "⚠️ Controls not found, appending button to body as fallback"
      );

    // if already exists, just ensure visible and return
    let existing = document.getElementById("farsi-caption-btn");
    if (existing) {
      existing.style.display = "";
      return existing;
    }

    const btn = document.createElement("button");
    btn.id = "farsi-caption-btn";
    btn.setAttribute("aria-label", "فعال‌سازی زیرنویس فارسی (FA)");
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
      marginLeft: "6px",
      background: "transparent",
      border: "none",
      color: "white",
      padding: "0",
      zIndex: 999999,
    });

    const svgDefault = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="rgba(255,255,255,0.12)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;
    const svgActive = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="rgba(0,170,255,0.48)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;
    const svgError = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" fill="rgba(255,0,0,0.48)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;

    btn.innerHTML = svgDefault;

    // per-page globals:
    // __farsiDownloadedForVideo: whether we've downloaded captions for current video id
    // __farsiCachedCaptions: cached captions array for this video
    // __farsiSubsActive: whether currently visible
    window.__farsiDownloadedForVideo =
      window.__farsiDownloadedForVideo || false;
    window.__farsiCachedCaptions = window.__farsiCachedCaptions || null;
    window.__farsiSubsActive = window.__farsiSubsActive ?? false;

    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "0.95"));

    btn.addEventListener("click", async () => {
      const videoId = getVideoIdFromUrl();
      // If we haven't downloaded for this video: download once and show
      if (!window.__farsiDownloadedForVideo) {
        // disable double clicks visually
        btn.innerHTML = svgActive;
        btn.style.transform = "scale(1.06)";
        await fetchCaptionsOnceForVideo(
          window.location.href,
          btn,
          svgActive,
          svgError,
          svgDefault
        );
        setTimeout(() => (btn.style.transform = ""), 120);
        return;
      }

      // otherwise just toggle visibility
      window.__farsiSubsActive = !window.__farsiSubsActive;
      if (window.__farsiSubsActive) {
        // show using cached captions
        if (
          window.__farsiCachedCaptions &&
          window.__farsiCachedCaptions.length
        ) {
          safeSendToBackground({
            type: "SHOW_TIMED_SUBS",
            captions: window.__farsiCachedCaptions,
          });

          btn.innerHTML = svgActive;
          btn.title = "زیرنویس فارسی: روشن (کلیک برای قطع)";
        } else {
          // missing cache (shouldn't happen) — mark as not downloaded
          console.warn(
            "⚠️ No cached captions found, resetting downloaded flag."
          );
          window.__farsiDownloadedForVideo = false;
          btn.innerHTML = svgDefault;
        }
      } else {
        // hide
        safeSendToBackground({ type: "TOGGLE_PERSIAN_SUBS" });
        document.dispatchEvent(new CustomEvent("farsi-toggle-hide"));
        btn.innerHTML = svgDefault;
        btn.title = "فعال‌سازی زیرنویس فارسی (FA)";
      }
    });

    // insert near CC button if possible
    let inserted = false;
    try {
      const ccSelectors = [
        ".ytp-subtitles-button",
        ".ytp-subtitle-button",
        "[aria-label*='Subtitles']",
        "[aria-label*='زیرنویس']",
      ];
      for (const s of ccSelectors) {
        const cc = (controls || document).querySelector
          ? (controls || document).querySelector(s)
          : null;
        if (cc && cc.parentNode) {
          cc.parentNode.insertBefore(btn, cc.nextSibling);
          inserted = true;
          break;
        }
      }
    } catch (e) {
      // ignore
    }
    if (!inserted) ensureContainerAppend(btn);

    return btn;
  }

  // --- SPA navigation watcher: only reset state on video change, do NOT auto-download ---
  let lastVideoId = getVideoIdFromUrl();

  const navObserver = new MutationObserver(() => {
    const currentId = getVideoIdFromUrl();
    if (currentId !== lastVideoId) {
      console.log("🎬 Video changed:", lastVideoId, "→", currentId);
      lastVideoId = currentId;

      // reset state and hide captions
      window.__farsiCachedCaptions = null;
      window.__farsiDownloadedForVideo = false;
      window.__farsiSubsActive = false;

      // tell captions to hide
      safeSendToBackground({ type: "TOGGLE_PERSIAN_SUBS" });
      document.dispatchEvent(new CustomEvent("farsi-toggle-hide"));

      // reset button UI (if exists)
      const btn = document.getElementById("farsi-caption-btn");
      if (btn) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" rx="3" fill="rgba(255,255,255,0.12)"/><text x="5" y="16" font-size="10" fill="white">FA</text></svg>`;
        btn.title = "فعال‌سازی زیرنویس فارسی (FA)";
      }

      // (Important) do NOT auto-fetch for new video. user must click button again.
      // Remove any leftover local subtitle box by dispatching event (captions.js listens).
      document.dispatchEvent(new CustomEvent("farsi-toggle-hide"));
    }
  });
  navObserver.observe(document.body, { childList: true, subtree: true });

  // initial creation (do not auto-start fetch)
  setTimeout(() => createCaptionButton(false), 600);

  // also listen to fallback postMessage from background if needed (debug)
  document.addEventListener("message", (ev) => {
    if (ev?.data?.__farsi_ext && ev.data.payload) {
      // noop for now, but keep log
      // console.log("🔔 received ext payload:", ev.data.payload.type);
    }
  });
}
