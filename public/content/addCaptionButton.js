// content/addCaptionButton.js
console.log("🎛️ addCaptionButton loaded (v2)");

/**
 * Robust waiter: poll + timeout + more selectors
 * returns the controls element or null after timeout
 */
function waitForControls(timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve) => {
    (function check() {
      // common YouTube control selectors
      const selectors = [
        ".ytp-right-controls",
        "#movie_player .ytp-right-controls",
        ".ytp-chrome-controls .ytp-right-controls"
      ];
      let controls = null;
      for (const s of selectors) {
        controls = document.querySelector(s);
        if (controls) break;
      }
      if (controls) {
        console.log("🔎 Found controls via selector:", controls);
        return resolve(controls);
      }
      if (Date.now() - start > timeoutMs) {
        console.warn("⏱ waitForControls timed out");
        return resolve(null);
      }
      requestAnimationFrame(check);
    })();
  });
}

async function createCaptionButton() {
  try {
    const controls = await waitForControls();
    if (!controls) return console.warn("❌ Controls not found - cannot add FA button");

    // don't recreate
    if (document.getElementById("farsi-caption-btn")) {
      console.log("ℹ️ farsi-caption-btn already exists, skipping");
      return;
    }

    // build button
    const btn = document.createElement("button");
    btn.id = "farsi-caption-btn";
    btn.className = "ytp-button";
    btn.setAttribute("aria-label", "فعال‌سازی زیرنویس فارسی (FA)");
    btn.title = "فعال‌سازی زیرنویس فارسی (FA)";
    Object.assign(btn.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: "36px",
      height: "36px",
      cursor: "pointer",
      opacity: "0.85",
      transition: "opacity 0.2s ease, transform 0.2s ease",
    });

    const svgDefault = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" ry="3" fill="rgba(255,255,255,0.15)"/><text x="5" y="16" font-size="10" fill="white" font-family="Arial, sans-serif" font-weight="bold">FA</text></svg>`;
    const svgActive = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" ry="3" fill="rgba(0,170,255,0.4)"/><text x="5" y="16" font-size="10" fill="white" font-family="Arial, sans-serif" font-weight="bold">FA</text></svg>`;
    const svgError = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="3" ry="3" fill="rgba(255,0,0,0.4)"/><text x="5" y="16" font-size="10" fill="white" font-family="Arial, sans-serif" font-weight="bold">FA</text></svg>`;

    btn.innerHTML = svgDefault;

    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "0.85"));

    btn.addEventListener("click", async () => {
      console.log("🎬 Persian subtitles activated!");
      btn.innerHTML = svgActive;
      btn.style.transform = "scale(1.18)";
      setTimeout(() => (btn.style.transform = "scale(1)"), 180);

      try {
        chrome.runtime.sendMessage({ type: "ACTIVATE_PERSIAN_SUBS" });
      } catch (e) {
        console.warn("⚠️ could not send ACTIVATE message to background", e);
      }

      try {
        const res = await fetch("http://localhost:3000/preload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: window.location.href }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "no success");

        chrome.runtime.sendMessage({
          type: "SHOW_TIMED_SUBS",
          captions: data.englishSegments || [{ start: 0, end: 9999, text: data.persian }],
        });
        console.log("✅ Sent SHOW_TIMED_SUBS");
      } catch (err) {
        console.error("❌ Translation fetch failed:", err);
        btn.innerHTML = svgError;
        setTimeout(() => (btn.innerHTML = svgDefault), 4000);
      }
    });

    // try finding CC button using several selectors (YouTube changes sometimes)
    const ccSelectors = [
      ".ytp-subtitles-button",
      ".ytp-subtitle-button",
      "[aria-label*='Subtitles']",
      "[aria-label*='زیرنویس']"
    ];
    let ccButton = null;
    for (const s of ccSelectors) {
      ccButton = controls.querySelector(s);
      if (ccButton) break;
    }

    if (ccButton) {
      controls.insertBefore(btn, ccButton);
      console.log("✅ Inserted FA button before CC button");
    } else {
      controls.appendChild(btn);
      console.log("✅ Appended FA button to controls (CC not found)");
    }
  } catch (e) {
    console.error("🔥 createCaptionButton error:", e);
  }
}

// Observe mutations and URL changes (SPA navigation)
let lastHref = location.href;
const navObserver = new MutationObserver(() => {
  if (location.href !== lastHref) {
    console.log("🔁 Navigation detected (url changed)", lastHref, "->", location.href);
    lastHref = location.href;
    // small delay to let new controls render
    setTimeout(() => createCaptionButton(), 700);
    return;
  }
  // try to create if controls appear and button missing
  if (!document.getElementById("farsi-caption-btn")) createCaptionButton();
});
navObserver.observe(document.documentElement || document.body, { childList: true, subtree: true });

// initial attempt (after small delay)
setTimeout(() => createCaptionButton(), 500);
