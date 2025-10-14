// public/content/addCaptionButton.js
console.log("🎛️ addCaptionButton loaded (robust)");

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
  // chrome.runtime ممکنه در بعضی حالت‌ها invalidated بشه — پس با fallback کار می‌کنیم
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
    console.warn("⚠️ chrome.runtime.sendMessage failed:", e);
  }
  // fallback: پیام محلی (captions.js هم این event را شنود می‌کند)
  try {
    window.postMessage({ __farsi_ext: true, payload: message }, "*");
  } catch (e) {
    try {
      window.dispatchEvent(
        new CustomEvent("farsi-runtime-message", { detail: message })
      );
    } catch (err) {
      console.warn("⚠️ fallback message also failed:", err);
    }
  }
}

function ensureContainerAppend(node) {
  // می‌خواهیم دکمه را داخل کنترل‌های یوتیوب قرار دهیم — ولی گاهی ساختار متفاوت است
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
  // fallback: append to body (visible) — تا دکمه قطعاً برگردد
  document.body.appendChild(node);
  return false;
}

async function createCaptionButton() {
  try {
    const controls = await waitForControls();
    // اگر اصلاً کنترل پیدا نشد، باز هم دکمه را در body ایجاد می‌کنیم تا قابل دسترسی باشد
    if (!controls)
      console.warn(
        "⚠️ Controls not found, will append button to body as fallback"
      );

    if (document.getElementById("farsi-caption-btn")) {
      // اگر قبلاً ساخته شده، فقط مطمئن شو که قابل مشاهده است
      const existing = document.getElementById("farsi-caption-btn");
      existing.style.display = "";
      return;
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

    // حالت در صفحه (صفحه-گلوبال)
    window.__farsiCachedCaptions = window.__farsiCachedCaptions || null;
    window.__farsiSubsActive = window.__farsiSubsActive ?? false;

    btn.addEventListener("mouseenter", () => (btn.style.opacity = "1"));
    btn.addEventListener("mouseleave", () => (btn.style.opacity = "0.95"));

    btn.addEventListener("click", async () => {
      console.log(
        "🖱 FA button clicked - cached:",
        !!window.__farsiCachedCaptions
      );
      try {
        if (!window.__farsiCachedCaptions) {
          // مرحله دانلود/ترجمه
          btn.innerHTML = svgActive;
          btn.style.transform = "scale(1.06)";

          const resp = await fetch("http://localhost:3000/preload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: window.location.href }),
          });

          const data = await resp.json().catch((e) => {
            throw new Error("Invalid JSON from server: " + e?.message);
          });
          console.log("📡 /preload response:", data);

          if (!data || !data.success) {
            throw new Error(data?.error || "Server returned no success");
          }

          const captions = data.captions || data.englishSegments || null;
          if (!captions || !Array.isArray(captions) || captions.length === 0) {
            // fallback: اگر هیچ segment نداشتیم، ساخت caption تک‌تکه
            const text = data.persian || data.fullText || data.english || "";
            const fallback = [
              { start: 0, end: 9999, text: text || "No subtitles" },
            ];
            window.__farsiCachedCaptions = fallback;
          } else {
            window.__farsiCachedCaptions = captions;
          }

          window.__farsiSubsActive = true;

          // 1) سعی کن به background بفرستی
          safeSendToBackground({
            type: "SHOW_TIMED_SUBS",
            captions: window.__farsiCachedCaptions,
          });

          // 2) fallback محلی: dispatch event که captions.js آن را گوش می‌کند
          try {
            window.dispatchEvent(
              new CustomEvent("farsi-show-timed", {
                detail: { captions: window.__farsiCachedCaptions },
              })
            );
          } catch (e) {
            console.warn("⚠️ dispatchEvent failed:", e);
            // باز هم fallback از طریق postMessage (captions.js باید هم این را گوش دهد)
            window.postMessage(
              {
                __farsi_ext: true,
                payload: {
                  type: "SHOW_TIMED_SUBS",
                  captions: window.__farsiCachedCaptions,
                },
              },
              "*"
            );
          }

          btn.title = "زیرنویس فارسی: روشن (کلیک برای قطع)";
          btn.innerHTML = svgActive;
          setTimeout(() => (btn.style.transform = ""), 120);
        } else {
          // فقط toggle نمایش/مخفی
          window.__farsiSubsActive = !window.__farsiSubsActive;
          if (window.__farsiSubsActive) {
            safeSendToBackground({
              type: "SHOW_TIMED_SUBS",
              captions: window.__farsiCachedCaptions,
            });
            window.dispatchEvent(
              new CustomEvent("farsi-show-timed", {
                detail: { captions: window.__farsiCachedCaptions },
              })
            );
            btn.innerHTML = svgActive;
          } else {
            safeSendToBackground({ type: "TOGGLE_PERSIAN_SUBS" });
            window.dispatchEvent(new CustomEvent("farsi-toggle-hide"));
            btn.innerHTML = svgDefault;
          }
        }
      } catch (err) {
        console.error("❌ Translation / preload failed:", err);
        btn.innerHTML = svgError;
        btn.title = "خطا در دانلود یا ترجمه";
        setTimeout(() => (btn.innerHTML = svgDefault), 3500);
      }
    });

    // درج دکمه (سعی می‌کنیم بعد از CC button درج کنیم)
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
      console.warn("⚠️ Insert after CC failed:", e);
    }

    if (!inserted) {
      ensureContainerAppend(btn);
    }

    console.log("✅ FA button ready and inserted");
  } catch (e) {
    console.error("🔥 createCaptionButton error:", e);
  }
}

// SPA navigation watcher — اگر URL تغییر کرد دکمه را دوباره می‌سازیم
let lastHref = location.href;
const obs = new MutationObserver(() => {
  if (location.href !== lastHref) {
    lastHref = location.href;
    setTimeout(() => createCaptionButton(), 700);
    return;
  }
  if (!document.getElementById("farsi-caption-btn")) createCaptionButton();
});
obs.observe(document.documentElement || document.body, {
  childList: true,
  subtree: true,
});

// همچنین گوش دهی به پیام‌های fallback از background (postMessage)
window.addEventListener("message", (ev) => {
  if (ev?.data?.__farsi_ext && ev.data.payload) {
    const msg = ev.data.payload;
    // اگر لازم باشه می‌تونیم اینجا هم واکنش نشان بدیم
    // (captions.js خودش event محلی را گوش می‌دهد)
    console.log("🔔 received ext postMessage payload:", msg?.type);
  }
});

// اجرا
setTimeout(() => createCaptionButton(), 600);
