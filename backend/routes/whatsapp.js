// whatsapp.js
// WhatsApp integration via Twilio's WhatsApp Sandbox (free for testing/demo).
// Reuses the exact same domain-classification + RAG pipeline as the web
// chat — WhatsApp is just an additional interface layer, not a separate
// system. This matters for real-world reach: in rural NE India, WhatsApp is
// on almost every phone already, while installing a new app is a real
// adoption barrier.
//
// SETUP (free, ~10 minutes):
// 1. Sign up at twilio.com, activate the WhatsApp Sandbox (Console →
//    Messaging → Try it out → Send a WhatsApp message)
// 2. Join the sandbox from your own WhatsApp by sending the given code to
//    the sandbox number
// 3. Set the Sandbox's "When a message comes in" webhook to:
//      https://<your-deployed-backend-url>/api/whatsapp-webhook
//    (for local testing, use ngrok: `ngrok http 5000`, then use the ngrok
//    URL — Twilio needs a public HTTPS URL, it can't reach localhost)
// 4. Message the sandbox number on WhatsApp — replies come from this route
//
// LANGUAGE SELECTION: since WhatsApp has no UI for picking a language pill,
// users prefix their message with a language code:
//   "AS: <question>" → Assamese    "NE: <question>" → Nepali
//   "BO: <question>" → Bodo        (no prefix) → English

const express = require("express");
const router = express.Router();

const { translateText, isLowResource } = require("../services/translate");
const { classifyDomain } = require("../services/domainRouter");
const { generateAnswer, generateAnswerNative, classifyDomainSemantic } = require("../services/rag");
const analytics = require("../services/analytics");

const LANG_PREFIXES = { "AS:": "as", "NE:": "ne", "BO:": "bo", "EN:": "en" };

function parseLanguageAndMessage(rawBody) {
  const trimmed = rawBody.trim();
  const upper = trimmed.toUpperCase();
  for (const [prefix, code] of Object.entries(LANG_PREFIXES)) {
    if (upper.startsWith(prefix)) {
      return { language: code, message: trimmed.slice(prefix.length).trim() };
    }
  }
  return { language: "en", message: trimmed }; // default to English if no prefix given
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function twimlReply(text) {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(text)}</Message></Response>`;
}

// POST /api/whatsapp-webhook
// Twilio sends incoming WhatsApp messages here as application/x-www-form-urlencoded
// with fields: Body (message text), From ("whatsapp:+91...")
router.post("/whatsapp-webhook", async (req, res) => {
  res.set("Content-Type", "text/xml");

  try {
    const rawBody = req.body.Body || "";
    if (!rawBody.trim()) {
      return res.send(twimlReply("Please send a question — e.g. 'How do I apply for a scholarship?' or 'AS: <your question in Assamese>'"));
    }

    const { language, message } = parseLanguageAndMessage(rawBody);

    if (!message) {
      return res.send(twimlReply("Please include your question after the language code, e.g. 'AS: <question>'"));
    }

    // --- Low-resource path (Bodo) — same logic as the web chat route ---
    if (isLowResource(language)) {
      const domain = "governance"; // WhatsApp has no domain picker; default + let retrieval search broadly
      const result = await generateAnswerNative(message, domain, language);
      analytics.logQuery({ domain, language, lowResourceMode: true });
      return res.send(twimlReply(result.answer_native || result.answer_en));
    }

    // --- Standard path — same pipeline as the web chat route ---
    const queryEn = await translateText(message, language, "en");

    const semantic = await classifyDomainSemantic(queryEn);
    const { domain, confidence } = semantic || classifyDomain(queryEn);
    const retrievalDomain = confidence === "default" ? null : domain;

    const result = await generateAnswer(queryEn, retrievalDomain, language);
    analytics.logQuery({ domain, language, lowResourceMode: false });

    res.send(twimlReply(result.text));
  } catch (err) {
    console.error("[whatsapp-webhook] error:", err);
    res.send(twimlReply("Sorry, something went wrong. Please try again in a moment."));
  }
});

module.exports = router;
