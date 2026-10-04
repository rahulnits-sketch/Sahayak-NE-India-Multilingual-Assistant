// geminiTTS.js
// Text-to-speech via Gemini's native audio output (Gemini 2.5 TTS models).
// Same reliability rationale as geminiSTT.js — reuses the Gemini connection
// that's already proven to work, instead of depending on a community
// Hugging Face Space that can sleep or change its API without notice.
//
// NOTE: Gemini's native TTS voices are optimized for major languages: NE
// regional language (Assamese/Bodo) pronunciation quality is not guaranteed
// to be as accurate as Bhashini/AI4Bharat's purpose-built Indic voices — but
// it reliably produces SOME audio, which matters more for a live demo than
// a theoretically-more-accurate voice that fails to connect.
//
// If this errors, check the current request shape at:
// https://ai.google.dev/gemini-api/docs/speech-generation (Google's TTS API
// evolves faster than most; parameter names occasionally shift).

const axios = require("axios");

async function textToSpeech(text, language) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured — Gemini TTS needs it");
  }

  const model = process.env.GEMINI_TTS_MODEL || "gemini-2.5-flash-preview-tts";

  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } }
        }
      }
    },
    { headers: { "content-type": "application/json" }, timeout: 20000 }
  );

  const audioPart = response.data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!audioPart) throw new Error("Gemini returned no audio data");

  // Gemini TTS returns raw PCM (not a WAV container) — wrap it in a minimal
  // WAV header so the browser's <audio> element can play it directly.
  const pcmBuffer = Buffer.from(audioPart.inlineData.data, "base64");
  const wavBuffer = wrapPcmAsWav(pcmBuffer, 24000); // Gemini TTS outputs 24kHz
  return wavBuffer.toString("base64");
}

function wrapPcmAsWav(pcmBuffer, sampleRate) {
  const buffer = Buffer.alloc(44 + pcmBuffer.length);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmBuffer.length, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmBuffer.length, 40);
  pcmBuffer.copy(buffer, 44);
  return buffer;
}

module.exports = { textToSpeech };
