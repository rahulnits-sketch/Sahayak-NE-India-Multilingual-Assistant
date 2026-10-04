// geminiSTT.js
// Speech-to-text via Gemini's native audio understanding — Gemini accepts
// audio directly as input and can transcribe it. This is far more reliable
// than depending on a free community Hugging Face Space (which can sleep,
// change its API shape, or go offline without notice) since it reuses the
// SAME Gemini connection that's already confirmed working for text answers.
//
// Order of preference in routes/speech.js: Bhashini (official, best NE
// language accuracy) → Gemini audio (reliable, decent accuracy for
// Assamese/Nepali, uncertain for Bodo) → AI4Bharat HF Space (last resort).

const axios = require("axios");

const LANGUAGE_NAMES = { en: "English", as: "Assamese", ne: "Nepali", bo: "Bodo", hi: "Hindi" };

async function speechToText(audioBase64, language) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured — Gemini audio transcription needs it");
  }

  const langName = LANGUAGE_NAMES[language] || "English";
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: "audio/wav", data: audioBase64 } },
            {
              text: `Transcribe this audio exactly as spoken, in ${langName} script. Output ONLY the transcript text, nothing else — no labels, no translation, no commentary.`
            }
          ]
        }
      ],
      generationConfig: { maxOutputTokens: 200, temperature: 0.1 }
    },
    { headers: { "content-type": "application/json" }, timeout: 20000 }
  );

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned no transcript");
  return text.trim();
}

module.exports = { speechToText };
