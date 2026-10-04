// ai4bharatSTT.js
// Backup speech-to-text using AI4Bharat's IndicConformer model, hosted as a
// free public Hugging Face Space (same AI4Bharat foundation that Bhashini
// itself is built on). No approval wait — usable immediately.
//
// SETUP: npm install @gradio/client (already added for TTS backup)
// No API key needed — free public Space (shared queue, so slower than a
// dedicated API — fine for demo purposes).
//
// NOTE FOR THE TEAM: if this throws a "parameter mismatch" error, check
//   https://huggingface.co/spaces/ai4bharat/indic-conformer?view=api
// for the Space's current exact input/output parameter names (Spaces
// occasionally change these when updated) — 2 minute fix.

const SPACE_ID = "ai4bharat/indic-conformer";

// IndicConformer language codes (ISO, matches the Space's dropdown options)
const ASR_LANG = { as: "as", ne: "ne", bo: "brx", en: "en", hi: "hi" };

let clientPromise = null;
async function getClient() {
  if (!clientPromise) {
    clientPromise = import("@gradio/client").then(({ Client }) => Client.connect(SPACE_ID));
  }
  return clientPromise;
}

// audioBase64: base64-encoded WAV audio (16kHz mono recommended)
async function speechToText(audioBase64, language) {
  const client = await getClient();
  const langCode = ASR_LANG[language] || "en";

  // Gradio Spaces that take file/audio input expect a Blob in Node — convert
  // the base64 string back into a Buffer/Blob for upload.
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const audioBlob = new Blob([audioBuffer], { type: "audio/wav" });

  const result = await client.predict("/transcribe", {
    audio: audioBlob,
    language: langCode,
    decoding: "ctc" // CTC is faster; switch to "rnnt" for slightly higher accuracy if needed
  });

  const transcript = result.data[0];
  if (typeof transcript === "string") return transcript;
  throw new Error("Unexpected response shape from AI4Bharat ASR Space — check the Space's API page for changes");
}

module.exports = { speechToText };
