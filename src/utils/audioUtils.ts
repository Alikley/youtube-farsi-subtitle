// src/utils/audioUtils.ts
// src/utils/audioUtils.ts

/**
 * تبدیل داده‌ی صوتی از Float32Array (WebAudio API) به Int16Array (PCM)
 */
export function float32ToInt16(buffer: Float32Array): Int16Array {
  const len = buffer.length;
  const result = new Int16Array(len);

  for (let i = 0; i < len; i++) {
    let s = Math.max(-1, Math.min(1, buffer[i])); // کلپ داده بین [-1, 1]
    result[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  return result;
}

/**
 * تبدیل Int16Array به ArrayBuffer برای ارسال به سرور یا API
 */
export function int16ToArrayBuffer(int16: Int16Array): ArrayBuffer {
  const buffer = new ArrayBuffer(int16.length * 2); // 2 بایت برای هر نمونه
  new Int16Array(buffer).set(int16);
  return buffer;
}

/**
 * تقسیم یک Float32Array بزرگ به چند تکه کوچک
 * @param buffer  داده اصلی
 * @param chunkSize  اندازه هر تکه
 */
export function chunkFloat32Array(
  buffer: Float32Array,
  chunkSize: number
): Float32Array[] {
  const result: Float32Array[] = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    result.push(buffer.subarray(i, i + chunkSize));
  }
  return result;
}
