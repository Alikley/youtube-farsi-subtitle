import OpenAI from "openai";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey:
    "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",
});

/**
 * نرمال‌سازی ورودی برای ترجمه
 * پذیرا: رشته، آرایه‌ی segmentها، شیء {segments, fullText} و ...
 * خروجی: رشته‌ی متنی که باید ترجمه شود
 * @param {any} input
 * @returns {string}
 */
function normalizeInputToString(input) {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (Array.isArray(input)) {
    // آرایه‌ای از رشته‌ها یا از segmentها
    return input
      .map((it) => {
        if (!it) return "";
        if (typeof it === "string") return it;
        if (typeof it === "object" && "text" in it)
          return String(it.text || "");
        return String(it);
      })
      .filter(Boolean)
      .join(" ");
  }
  if (typeof input === "object") {
    // ممکن است { segments: [...] } یا { fullText: "..." } یا { text: "..." }
    if ("fullText" in input && typeof input.fullText === "string")
      return input.fullText;
    if ("text" in input && typeof input.text === "string") return input.text;
    if (Array.isArray(input.segments)) {
      return input.segments
        .map((s) =>
          s && typeof s === "object" ? String(s.text || "") : String(s)
        )
        .filter(Boolean)
        .join(" ");
    }
    // fallback: stringify
    try {
      return JSON.stringify(input);
    } catch {
      return String(input);
    }
  }
  // other primitives
  return String(input);
}

/**
 * ترجمه روان و طبیعی از انگلیسی به فارسی
 * @param {string|object|Array} text متن انگلیسی یا ساختار segments
 * @returns {Promise<string>} خروجی فارسی
 */
export async function translateToPersian(text) {
  try {
    const normalized = normalizeInputToString(text).trim();
    if (!normalized) return "[Empty input]";

    console.log("🌐 Translating with GPT-4o-mini...");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a professional Farsi translator. Translate the text into fluent, natural Persian with accurate tone, and avoid literal translations.",
        },
        { role: "user", content: normalized },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    });

    // SDK may return content in different shapes; try common locations
    const translated =
      response?.choices?.[0]?.message?.content?.trim() ||
      response?.choices?.[0]?.text?.trim() ||
      response?.data?.[0]?.text?.trim() ||
      null;

    if (!translated) throw new Error("Empty translation result from OpenAI");

    console.log("✅ Translation done!");
    return translated;
  } catch (err) {
    console.error("⚠️ GPT translation failed:", err?.message || err);

    // --- 🕊️ fallback ساده با LibreTranslate ---
    try {
      console.log("🔄 Falling back to LibreTranslate...");
      const res = await fetch("https://libretranslate.com/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: normalizeInputToString(text),
          source: "en",
          target: "fa",
          format: "text",
        }),
      });
      const data = await res.json();
      if (data?.translatedText) {
        console.log("✅ Fallback translation (LibreTranslate) succeeded.");
        return data.translatedText;
      }
      // some instances return 'translatedText' or 'translated' differently
      if (data?.translated) {
        return data.translated;
      }
      throw new Error("Fallback translation returned no translated text.");
    } catch (fallbackErr) {
      console.error(
        "❌ Both translators failed:",
        fallbackErr?.message || fallbackErr
      );
      return "[Translation failed]";
    }
  }
}
