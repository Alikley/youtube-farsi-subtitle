// server/translator.js
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getUserUsage, addUserUsage } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MAX_SECONDS_PER_DAY = Number(process.env.MAX_SECONDS_PER_DAY || 7200);

/**
 * تبدیل ورودی به متن قابل ترجمه
 */
function normalizeInputToString(input) {
  if (input == null) return "";
  if (typeof input === "string") return input;
  if (Array.isArray(input)) {
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
    try {
      return JSON.stringify(input);
    } catch {
      return String(input);
    }
  }
  return String(input);
}

/**
 * ترجمه با محدودیت روزانه برای هر userId
 */
export async function translateWithQuota({
  userId,
  text,
  durationSeconds = 0,
}) {
  if (!userId) throw new Error("userId is required");
  const normalized = normalizeInputToString(text).trim();
  if (!normalized) return "[Empty input]";

  const today = new Date().toISOString().slice(0, 10);
  const used = await getUserUsage(userId, today);

  if (used >= MAX_SECONDS_PER_DAY) {
    throw new Error("Daily usage limit reached");
  }

  // 🧠 تنظیم داینامیک max_tokens
  const length = normalized.length;
  let maxTokens = 400;
  if (length > 2000) maxTokens = 1000;
  if (length > 8000) maxTokens = 2000;
  if (length > 15000) maxTokens = 3000;
  if (length > 30000) maxTokens = 4000;

  console.log(`🧩 max_tokens = ${maxTokens} | userId=${userId}`);

  try {
    const response = await axios.post(
      "https://api.deepseek.com/v1/chat/completions",
      {
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "You are a professional Farsi translator. Translate the text into fluent, natural Persian with accurate tone, and avoid literal translations.",
          },
          { role: "user", content: normalized },
        ],
        temperature: 0.3,
        max_tokens: maxTokens,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        timeout: 180000,
      }
    );

    const translated =
      response?.data?.choices?.[0]?.message?.content?.trim() ||
      response?.data?.choices?.[0]?.text?.trim() ||
      null;

    if (!translated) throw new Error("Empty translation result from DeepSeek");

    // ثبت مصرف
    await addUserUsage(userId, today, durationSeconds);
    const newTotal = await getUserUsage(userId, today);

    console.log(`✅ ${userId} used ${newTotal}/${MAX_SECONDS_PER_DAY} sec`);
    return {
      translated,
      usage: { used: newTotal, limit: MAX_SECONDS_PER_DAY },
    };
  } catch (err) {
    console.error("⚠️ DeepSeek translation failed:", err.message);
    throw err;
  }
}
