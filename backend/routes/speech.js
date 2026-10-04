const express = require("express");
const router = express.Router();
const bhashini = require("../services/bhashini");
const ai4bharatTTS = require("../services/ai4bharatTTS");
const ai4bharatSTT = require("../services/ai4bharatSTT");
const geminiSTT = require("../services/geminiSTT");
const geminiTTS = require("../services/geminiTTS");
const imageAnalysis = require("../services/imageAnalysis");

// POST /api/speech-to-text
// body: { audio: base64String, language: "as"|"ne"|"bo"|"en" }
router.post("/speech-to-text", async (req, res) => {
  const { audio, language } = req.body;
  if (!audio || !language) {
    return res.status(400).json({ error: "audio and language are required" });
  }

  // 1. Try Bhashini first (official govt platform — best NE-language accuracy)
  if (bhashini.isConfigured()) {
    try {
      const transcript = await bhashini.speechToText(audio, language);
      return res.json({ transcript, provider: "bhashini" });
    } catch (err) {
      console.error("[speech-to-text] Bhashini failed, trying Gemini:", err.response?.data || err.message);
    }
  }

  // 2. Try Gemini's audio understanding (reliable — same connection already
  // confirmed working for text answers, no third-party Space to go down)
  try {
    const transcript = await geminiSTT.speechToText(audio, language);
    return res.json({ transcript, provider: "gemini" });
  } catch (err) {
    console.error("[speech-to-text] Gemini failed, trying AI4Bharat backup:", err.message);
  }

  // 3. Last resort: AI4Bharat's free Hugging Face Space
  try {
    const transcript = await ai4bharatSTT.speechToText(audio, language);
    return res.json({ transcript, provider: "ai4bharat" });
  } catch (err) {
    console.error("[speech-to-text] AI4Bharat backup also failed:", err.message);
    return res.status(503).json({
      error: "Voice input unavailable — Bhashini, Gemini, and the AI4Bharat backup all failed. Check backend/.env and network access.",
      detail: err.message
    });
  }
});

// POST /api/text-to-speech
// body: { text: string, language: "as"|"ne"|"bo"|"en" }
router.post("/text-to-speech", async (req, res) => {
  const { text, language } = req.body;
  if (!text || !language) {
    return res.status(400).json({ error: "text and language are required" });
  }

  // 1. Try Bhashini first (official govt platform — best NE-language accuracy)
  if (bhashini.isConfigured()) {
    try {
      const audioBase64 = await bhashini.textToSpeech(text, language);
      return res.json({ audio: audioBase64, provider: "bhashini" });
    } catch (err) {
      console.error("[text-to-speech] Bhashini failed, trying Gemini:", err.response?.data || err.message);
    }
  }

  // 2. Try Gemini's native TTS (reliable — same connection already working)
  try {
    const audioBase64 = await geminiTTS.textToSpeech(text, language);
    return res.json({ audio: audioBase64, provider: "gemini" });
  } catch (err) {
    console.error("[text-to-speech] Gemini failed, trying AI4Bharat backup:", err.message);
  }

  // 3. Last resort: AI4Bharat's free Hugging Face Space
  try {
    const audioBase64 = await ai4bharatTTS.textToSpeech(text, language);
    return res.json({ audio: audioBase64, provider: "ai4bharat" });
  } catch (err) {
    console.error("[text-to-speech] AI4Bharat backup also failed:", err.message);
    return res.status(503).json({
      error: "Voice output unavailable — Bhashini, Gemini, and the AI4Bharat backup all failed. Check backend/.env and network access.",
      detail: err.message
    });
  }
});

// POST /api/analyze-image
// body: { image: base64String, mimeType: "image/jpeg"|"image/png", language, question?: string }
router.post("/analyze-image", async (req, res) => {
  try {
    const { image, mimeType, language = "en", question } = req.body;
    if (!image || !mimeType) {
      return res.status(400).json({ error: "image and mimeType are required" });
    }
    const answer = await imageAnalysis.analyzeImage(image, mimeType, language, question);
    res.json({ answer });
  } catch (err) {
    console.error("[analyze-image] error:", err.response?.data || err.message);
    res.status(500).json({ error: "Image analysis failed", detail: err.message });
  }
});

// GET /api/voice-status — diagnostic endpoint to check which voice
// providers are configured, without needing to trigger a real request from
// the UI. Useful when debugging "why is voice not working" during setup.
router.get("/voice-status", async (req, res) => {
  const status = {
    bhashini: {
      configured: bhashini.isConfigured(),
      note: bhashini.isConfigured() ? "credentials set" : "BHASHINI_USER_ID/BHASHINI_API_KEY not set in .env"
    },
    gemini: {
      configured: !!process.env.GEMINI_API_KEY,
      note: process.env.GEMINI_API_KEY ? "key set (TTS uses gemini-2.5-flash-preview-tts, an experimental model — may not be enabled on all API tiers)" : "GEMINI_API_KEY not set in .env"
    },
    ai4bharat: {
      configured: true,
      note: "free public Hugging Face Space — no key needed, but can be unreliable (sleeps, changes API shape, or goes down without notice). Treat as best-effort only, not for live demo dependency."
    }
  };
  res.json(status);
});

module.exports = router;
