import { Logger } from "../../src/utils/logger";
import { float32ToInt16 } from "../../src/utils/audioUtils";
import { MessageType } from "../../src/types";
export {};
declare const chrome: any;
const log = new Logger("AudioCapture");

let started = false;
let bufferQueue: Int16Array[] = [];
let sampleRateGlobal = 44100;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

// ----------------------------
// 🧩 Base64 encoder
// ----------------------------
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ----------------------------
// ⚡ WAV encoder (16-bit PCM)
// ----------------------------
function encodeWAV(int16Data: Int16Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + int16Data.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + int16Data.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, int16Data.length * 2, true);

  new Uint8Array(buffer).set(new Uint8Array(int16Data.buffer), 44);
  return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ----------------------------
// 🚀 Sending audio chunks
// ----------------------------
function sendBufferIfReady(force = false) {
  const totalSamples = bufferQueue.reduce((s, b) => s + b.length, 0);
  if (totalSamples >= sampleRateGlobal * 2 || force) {
    const merged = new Int16Array(totalSamples);
    let off = 0;
    for (const b of bufferQueue) {
      merged.set(b, off);
      off += b.length;
    }
    bufferQueue = [];

    const wavBuffer = encodeWAV(merged, sampleRateGlobal);
    chrome.runtime.sendMessage({
      type: MessageType.AUDIO_CAPTURE,
      sampleRate: sampleRateGlobal,
      audioData: arrayBufferToBase64(wavBuffer),
    });

    log.info(`📤 Sent ${totalSamples} samples to background`);
  }
}

// ----------------------------
// 🧠 Preload full YouTube video
// ----------------------------
async function preloadFullVideoAudio(_video: HTMLVideoElement) {
  try {
    const videoUrl = window.location.href;
    log.info("🚀 Preloading YouTube video:", videoUrl);

    const response = await fetch("http://localhost:3000/preload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: videoUrl }),
    });

    const data = await response.json();
    if (data.text) {
      log.info(
        "📝 Full transcript ready:",
        data.text.substring(0, 200) + "..."
      );
      // بعداً برای مرحله ۴ (زیرنویس) ازش استفاده می‌کنیم
      localStorage.setItem("fullTranscript", data.text);
    } else {
      log.warn("⚠️ Preload returned no text");
    }
  } catch (err) {
    log.error("❌ Preload failed:", err);
  }
}

// ----------------------------
// 🎧 Main capture function
// ----------------------------
export async function captureYouTubeAudio() {
  if (started) return;
  started = true;

  const video = document.querySelector("video");
  if (!video) {
    log.warn("❌ No video found. Retrying...");
    started = false;
    setTimeout(captureYouTubeAudio, 2000);
    return;
  }

  await preloadFullVideoAudio(video);

  let audioCtx: AudioContext | undefined;
  try {
    audioCtx = new AudioContext({ latencyHint: "interactive" });
    await audioCtx.resume();
    sampleRateGlobal = audioCtx.sampleRate;

    const stream = (video as any).captureStream() as MediaStream;
    const clonedStream = stream.clone();
    const source = audioCtx.createMediaStreamSource(clonedStream);

    const workletUrl = chrome.runtime.getURL("audio-processor.js");
    await audioCtx.audioWorklet.addModule(workletUrl);

    const node = new AudioWorkletNode(audioCtx, "audio-processor");
    node.port.onmessage = (e) => {
      const f32 = e.data as Float32Array;
      const pcm = float32ToInt16(f32);
      bufferQueue.push(pcm);
      sendBufferIfReady();

      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (bufferQueue.length > 0) sendBufferIfReady(true);
      }, 3000);
    };

    source.connect(node).connect(audioCtx.destination);
    log.info("🎧 AudioWorklet capturing started...");
  } catch (err) {
    log.error("❌ AudioWorklet failed:", err);
  }

  video.addEventListener("play", () => {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  });

  log.info("🎤 Audio capture started successfully");
}
