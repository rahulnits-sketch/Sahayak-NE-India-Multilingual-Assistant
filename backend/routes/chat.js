const express = require("express");
const router = express.Router();

const { translateText, isLowResource } = require("../services/translate");
const { classifyDomain } = require("../services/domainRouter");
const { generateAnswer, generateAnswerNative, classifyDomainSemantic } = require("../services/rag");
const analytics = require("../services/analytics");
const cache = require("../services/cache");

// POST /api/chat
// body: { message: string, language: "as" | "ne" | "en" | "bo", domain?: string,
//         history?: [{role: "user"|"bot", text: string}] }
router.post("/chat", async (req, res) => {
  try {
    const { message, language = "en", domain: forcedDomain, history = [] } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    // --- LOW-RESOURCE PATH (e.g. Bodo) ---
    // No MT/ASR engine reliably supports these, so we never round-trip
    // through English. Domain must be explicitly selected by the user in
    // this path (keyword-based auto-detect only works on English tokens).
    if (isLowResource(language)) {
      const domain = forcedDomain || "governance"; // sensible default if not selected
      const result = await generateAnswerNative(message, domain, language);
      analytics.logQuery({ domain, language, lowResourceMode: true });

      return res.json({
        query_original: message,
        query_translated_en: null,
        domain,
        domain_confidence: forcedDomain ? "user-selected" : "default (select a domain for better matches)",
        answer_en: result.answer_en,
        answer_native: result.answer_native || result.answer_en,
        language,
        low_resource_mode: true,
        matched: result.matched
      });
    }

    // --- STANDARD PATH (Assamese, Nepali, English) ---
    // Step 1: translate query to English for domain routing + retrieval
    // (query translation still uses Bhashini/LibreTranslate — only the
    // query leg, not the answer leg, needs external translation now)
    const queryEn = await translateText(message, language, "en");

    // Check cache before doing any classification/generation work — history
    // makes each conversation's answers context-dependent, so only cache
    // when there's no prior conversation (fresh queries are the common
    // repeat case — "what documents for scholarship" asked by many users)
    if (!forcedDomain && history.length === 0) {
      const cached = cache.get(queryEn, null, language);
      if (cached) {
        analytics.logQuery({ domain: cached.domain, language, lowResourceMode: false });
        return res.json({ ...cached, cached: true });
      }
    }

    // Step 2: classify domain. Try semantic classification first (accurate,
    // works across languages/phrasings via the same embeddings pipeline as
    // retrieval) — falls back to keyword matching if Gemini isn't configured
    // or the semantic call fails for any reason.
    let domain, confidence;
    if (forcedDomain) {
      domain = forcedDomain;
      confidence = "user-selected";
    } else {
      const semantic = await classifyDomainSemantic(queryEn);
      if (semantic) {
        domain = semantic.domain;
        confidence = semantic.confidence;
      } else {
        const keyword = classifyDomain(queryEn);
        domain = keyword.domain;
        confidence = keyword.confidence;
      }
    }

    // Step 3: RAG — retrieve context + generate answer DIRECTLY in the
    // user's language (Gemini does this in one call — no separate
    // translate-the-answer-back step needed, which removes a failure point)
    //
    // If domain classification wasn't confident (no keyword matched — often
    // because the query was in a script/language the English-keyword router
    // doesn't recognize), search across ALL domains instead of locking into
    // the fallback guess. This avoids the failure mode where an unrelated
    // domain's context gets used just because classification defaulted to it.
    const retrievalDomain = confidence === "default" ? null : domain;
    const result = await generateAnswer(queryEn, retrievalDomain, language, history);
    analytics.logQuery({ domain, language, lowResourceMode: false });

    const responseBody = {
      query_original: message,
      query_translated_en: queryEn,
      domain,
      domain_confidence: confidence,
      answer_en: language === "en" ? result.text : null,
      answer_native: result.text,
      answer_source: result.source, // "dataset_grounded" | "ai_general_knowledge" | "dataset_fallback" | "no_match" | "error"
      similarity_score: result.similarityScore, // 0-1 cosine similarity when semantic search was used, null otherwise
      trace: result.trace, // retrieval trace for the "How I got this answer" panel
      language,
      low_resource_mode: false
    };

    // Only cache clean, standalone answers (no conversation history involved,
    // no forced domain override) — keeps cached entries broadly reusable
    // across different users asking the same common question.
    if (!forcedDomain && history.length === 0 && result.source !== "error") {
      cache.set(queryEn, null, language, responseBody);
    }

    res.json(responseBody);
  } catch (err) {
    console.error("[chat route] error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
