import type { ExtensionMessage } from "./index";

// 🔹 تعریف‌های global (برای window)
declare global {
  interface Window {
    postMessage(
      message: ExtensionMessage,
      targetOrigin: string,
      transfer?: Transferable[]
    ): void;
  }
}

export {};
