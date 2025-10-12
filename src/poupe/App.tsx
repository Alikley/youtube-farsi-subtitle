import { useEffect, useState } from "react";

declare const chrome: any;

function App() {
  const [status, setStatus] = useState<"idle" | "capturing">("idle");
  const [lastChunk, setLastChunk] = useState<string>("No data yet");
  const [transcript, setTranscript] = useState<string>("");

  useEffect(() => {
    // اتصال به background (فقط یکی نگه داشتم)
    const port = chrome.runtime.connect({ name: "popup-logger" });

    type BackgroundMessage =
      | { type: "STATUS"; status: "idle" | "capturing" }
      | {
          type: "AUDIO_CHUNK";
          data: ArrayBuffer | number[];
          sampleRate: number;
        }
      | { type: "TRANSCRIPT"; data: string };

    port.onMessage.addListener((msg: BackgroundMessage) => {
      if (msg.type === "STATUS") {
        setStatus(msg.status);
      }
      if (msg.type === "AUDIO_CHUNK") {
        const sampleCount = Array.isArray(msg.data)
          ? msg.data.length
          : msg.data.byteLength;
        setLastChunk(`Samples: ${sampleCount}, Rate: ${msg.sampleRate}`);
      }
      if (msg.type === "TRANSCRIPT") {
        setTranscript((prev) => prev + " " + msg.data);
      }
    });
    return () => port.disconnect();
  }, []);

  return (
    <div style={{ width: 250, padding: 12, fontFamily: "sans-serif" }}>
      <h3>🎤 YouTube Subtitle</h3>
      <p>
        <b>Status:</b> {status}
      </p>
      <div
        style={{
          marginTop: 10,
          padding: 8,
          border: "1px solid #ccc",
          borderRadius: 4,
          fontSize: "0.9em",
          background: "#f9f9f9",
        }}
      >
        <b>Last Audio Chunk:</b>
        <br />
        {lastChunk}
      </div>
      <div style={{ marginTop: 10 }}>
        <b>Transcript:</b>
        <p>{transcript || "⏳ در حال پردازش ..."}</p>
      </div>
      <button
        onClick={() =>
          chrome.runtime.sendMessage({ type: "ACTIVATE_PERSIAN_SUBS" })
        }
      >
        🎬 فعال‌سازی زیرنویس فارسی
      </button>
    </div>
  );
}

export default App;
