// 🔹 تعریف نوع معتبر برای پیام‌ها
export type MessageType = "AUDIO_CHUNK" | "STATUS" | "TRANSCRIPT";

export const MessageType = {
  AUDIO_CHUNK: "AUDIO_CHUNK" as MessageType,
  AUDIO_CAPTURE: "AUDIO_CAPTURE" as MessageType,
  STATUS: "STATUS" as MessageType,
  TRANSCRIPT: "TRANSCRIPT" as MessageType,
};

// 🔹 پیام عمومی
export interface ExtensionMessage {
  type: MessageType;
  data?: any;
}

// 🔹 پیام خاص برای گرفتن صدا
export interface AudioChunkMessage extends ExtensionMessage {
  type: "AUDIO_CHUNK";
  data: ArrayBuffer; // داده‌ی خام صدا
  sampleRate: number;
}

// 🔹 پیام وضعیت (فعال یا متوقف بودن)
export interface StatusMessage extends ExtensionMessage {
  type: "STATUS";
  status: "capturing" | "stopped";
}
