// content/captions.js
console.log("🎬 captions.js loaded");

let subtitleBox = null;
function ensureBox() {
  if (subtitleBox) return subtitleBox;
  subtitleBox = document.getElementById("persian-subtitle-box");
  if (subtitleBox) return subtitleBox;

  subtitleBox = document.createElement("div");
  subtitleBox.id = "persian-subtitle-box";
  subtitleBox.className = "persian-caption";
  Object.assign(subtitleBox.style, {
    position: "absolute",
    bottom: "10%",
    left: "50%",
    transform: "translateX(-50%)",
    maxWidth: "90%",
    textAlign: "center",
    fontSize: "22px",
    fontFamily: "Tahoma, sans-serif",
    color: "#fff",
    textShadow: "2px 2px 6px rgba(0,0,0,0.8)",
    padding: "8px 12px",
    background: "rgba(0,0,0,0.45)",
    borderRadius: "8px",
    zIndex: "2147483647",
    display: "none",
    pointerEvents: "none",
  });

  const container = document.querySelector("#movie_player") || document.body;
  container.appendChild(subtitleBox);
  return subtitleBox;
}

function showSubtitle(text) {
  ensureBox();
  subtitleBox.innerText = text;
  subtitleBox.style.display = "block";
}

function hideSubtitle() {
  if (subtitleBox) subtitleBox.style.display = "none";
}

let intervalId = null;
function startTimed(captions) {
  const video = document.querySelector("video");
  if (!video) return console.warn("No video for timed subs");
  if (intervalId) clearInterval(intervalId);
  intervalId = setInterval(() => {
    const t = video.currentTime;
    const idx = captions.findIndex((c) => t >= c.start && t <= c.end);
    if (idx !== -1) {
      showSubtitle(captions[idx].text);
    } else {
      hideSubtitle();
    }
  }, 250);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SHOW_PERSIAN_SUB") {
    showSubtitle(msg.text);
  }
  if (msg.type === "SHOW_TIMED_SUBS") {
    startTimed(msg.captions || []);
  }
});
