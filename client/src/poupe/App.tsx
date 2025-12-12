import { useEffect, useState } from "react";
declare const chrome: any;

function App() {
  const [usedMinutes, setUsedMinutes] = useState(0);
  const [limitMinutes, setLimitMinutes] = useState(120);

  const loadUsage = () => {
    chrome.storage.local.get(["usage"], (res: any) => {
      if (res?.usage) {
        const usedSec = res.usage.used || 0;
        const limitSec = res.usage.limit || 7200;
        setUsedMinutes(Math.floor(usedSec / 60));
        setLimitMinutes(Math.floor(limitSec / 60));
      }
    });
  };

  useEffect(() => {
    loadUsage();

    // 👂 گوش دادن به تغییرات storage (در صورتی که background ذخیره کند)
    chrome.storage.onChanged.addListener((changes: any) => {
      if (changes.usage?.newValue) loadUsage();
    });

    // 👂 گوش دادن مستقیم به پیام background
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg.type === "USAGE_UPDATED" && msg.usage) {
        const usedSec = msg.usage.used || 0;
        const limitSec = msg.usage.limit || 7200;
        setUsedMinutes(Math.floor(usedSec / 60));
        setLimitMinutes(Math.floor(limitSec / 60));
      }
    });
  }, []);

  const percent = Math.min(100, (usedMinutes / limitMinutes) * 100);

  return (
    <div
      style={{
        width: 260,
        padding: 16,
        fontFamily: "sans-serif",
        textAlign: "center",
      }}
    >
      <h3 style={{ marginBottom: 12 }}>
        <span role="img" aria-label="mic">
          🎤
        </span>{" "}
        YouTube Subtitle
      </h3>

      <div
        style={{
          background: "#f5f5f5",
          padding: "12px 14px",
          borderRadius: 12,
          fontSize: 15,
          fontWeight: 500,
          marginTop: 6,
        }}
      >
        ⏱ مصرف امروز: <b>{usedMinutes}</b> / {limitMinutes} دقیقه
        <div
          style={{
            height: 8,
            borderRadius: 6,
            background: "#ddd",
            marginTop: 8,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: "100%",
              background:
                percent < 70 ? "#4caf50" : percent < 90 ? "#ffc107" : "#f44336",
              transition: "width 0.4s ease",
            }}
          ></div>
        </div>
      </div>
    </div>
  );
}

export default App;
