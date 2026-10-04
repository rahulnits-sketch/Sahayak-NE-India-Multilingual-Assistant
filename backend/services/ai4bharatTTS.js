// ai4bharatTTS.js
// Backup text-to-speech using AI4Bharat's Indic Parler-TTS model, hosted as
// a free public Hugging Face Space. This is the SAME research foundation
// that Bhashini itself is built on (AI4Bharat is one of the core R&D
// partners behind Bhashini) — but accessible immediately via Hugging Face,
// with no government approval wait required.
//
// Use this when Bhashini isn't configured/approved yet. Once Bhashini access
// arrives, prefer it (routes/speech.js tries Bhashini first, falls back here).
//
// SETUP: npm install @gradio/client
// No API key needed — the public Space is free to call (rate-limited/shared
// queue, so expect slower responses than a dedicated API, fine for a demo).
//
// NOTE FOR THE TEAM: Hugging Face Spaces occasionally change their exact
// input/output parameter names when the underlying app is updated. If this
// throws a "parameter mismatch" style error, open:
//   https://huggingface.co/spaces/ai4bharat/indic-parler-tts?view=api
// which shows the exact current parameter names/order to plug in below —
// takes 2 minutes to check and fix if the Space has changed.

const SPACE_ID = "ai4bharat/indic-parler-tts";

// Indic Parler-TTS takes a natural-language "description" of the voice/style
// alongside the language, rather than a strict language code — these presets
// are tuned per language for a clear, neutral government-assistant tone.
const VOICE_DESCRIPTION = {
  as: "A clear, neutral Assamese female voice speaking at a moderate pace with good recording quality.",
  ne: "A clear, neutral Nepali female voice speaking at a moderate pace with good recording quality.",
  bo: "A clear, neutral Bodo female voice speaking at a moderate pace with good recording quality.",
  en: "A clear, neutral Indian English female voice speaking at a moderate pace with good recording quality."
};

let clientPromise = null;
async function getClient() {
  // Lazy-load @gradio/client (ESM-only package) and cache the connection
  if (!clientPromise) {
    clientPromise = import("@gradio/client").then(({ Client }) => Client.connect(SPACE_ID));
  }
  return clientPromise;
}

async function textToSpeech(text, language) {
  const client = await getClient();
  const description = VOICE_DESCRIPTION[language] || VOICE_DESCRIPTION.en;

  // predict() call shape follows the Space's documented API (see NOTE above
  // if this needs adjusting after a Space update)
  const result = await client.predict("/generate_audio", {
    text,
    description
  });

  // Gradio audio outputs are typically returned as a file reference/URL
  const audioData = result.data[0];
  if (audioData?.url) {
    // Fetch the actual audio bytes from the Space's returned URL
    const axios = require("axios");
    const audioResponse = await axios.get(audioData.url, { responseType: "arraybuffer" });
    return Buffer.from(audioResponse.data).toString("base64");
  }
  throw new Error("Unexpected response shape from AI4Bharat TTS Space — check the Space's API page for changes");
}

module.exports = { textToSpeech };
