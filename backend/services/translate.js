// translate.js
// Tries Bhashini NMT first (Government of India platform — reliable for
// Assamese/Nepali, and keeps the whole pipeline on one consistent govt
// service). Falls back to the free public LibreTranslate instance if
// Bhashini isn't configured, and finally to returning the original text
// untranslated if both fail — so the demo never crashes, it just degrades.

const axios = require("axios");
const bhashini = require("./bhashini");

const LIBRETRANSLATE_URL = process.env.LIBRETRANSLATE_URL || "https://libretranslate.de/translate";

// Map our internal language codes to LibreTranslate codes.
// NOTE: LibreTranslate's free instance has inconsistent NE-language coverage.
// If "as" (Assamese) isn't supported by your instance, the function falls
// back to returning the original text untranslated (fail-safe for demo).
const LANG_MAP = {
  as: "as", // Assamese
  ne: "ne", // Nepali
  en: "en"
};

// Languages with no reliable public MT/ASR coverage. For these, the system
// does NOT attempt machine translation — it relies on native-language
// retrieval instead (see rag.js retrieveNative). This is the honest way to
// handle genuinely low-resource dialects: don't pretend an MT engine that
// doesn't really support the language is giving good results.
const LOW_RESOURCE_LANGS = new Set(["bo"]); // Bodo — extend with Khasi, Garo, Mizo etc. as corpora are built

function isLowResource(langCode) {
  return LOW_RESOURCE_LANGS.has(langCode);
}

async function translateText(text, sourceLang, targetLang) {
  if (sourceLang === targetLang) return text;
  if (isLowResource(sourceLang) || isLowResource(targetLang)) {
    // No safe MT path — caller (routes/chat.js) should avoid calling this
    // for low-resource languages and use native retrieval instead.
    return text;
  }

  // Try Bhashini first, if credentials are set
  if (bhashini.isConfigured()) {
    try {
      return await bhashini.translateViaNmt(text, sourceLang, targetLang);
    } catch (err) {
      console.error(`[translate] Bhashini failed, trying LibreTranslate — ${err.message}`);
    }
  }

  // Fall back to free public LibreTranslate
  try {
    const response = await axios.post(LIBRETRANSLATE_URL, {
      q: text,
      source: LANG_MAP[sourceLang] || sourceLang,
      target: LANG_MAP[targetLang] || targetLang,
      format: "text"
    }, { timeout: 8000 });

    return response.data.translatedText || text;
  } catch (err) {
    console.error(`[translate] fallback (no translation) — ${err.message}`);
    // Fail-safe: return original text rather than crashing the demo
    return text;
  }
}

module.exports = { translateText, isLowResource, LOW_RESOURCE_LANGS };
