import { useEffect, useState } from "react";
declare const chrome: any;

function App() {
  const [usedMinutes, setUsedMinutes] = useState(0);
  const [limitMinutes, setLimitMinutes] = useState(120);

  useEffect(() => {
    const loadUsage = () => {
      chrome.storage.local.get(["usage"], (res: any) => {
        if (res?.usage) {
          setUsedMinutes(Math.floor((res.usage.used || 0) / 60));
          setLimitMinutes(Math.floor((res.usage.limit || 7200) / 60));
        }
      });
    };

    loadUsage();
    chrome.storage.onChanged.addListener((changes: any) => {
      if (changes.usage?.newValue) loadUsage();
    });
  }, []);

  return (
    <div style={{ width: 250, padding: 12, fontFamily: "sans-serif" }}>
      <h3>🎤 YouTube Subtitle</h3>
      <div
        style={{
          marginTop: 10,
          padding: 8,
          borderRadius: 8,
          background: "#f5f5f5",
          textAlign: "center",
        }}
      >
        ⏱ مصرف امروز:{" "}
        <strong>
          {usedMinutes} / {limitMinutes} دقیقه
        </strong>
      </div>
    </div>
  );
}

export default App;
