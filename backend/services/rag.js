// rag.js
// Retrieval: semantic vector search (embeddings.js) when Gemini is
// configured — this is the real RAG architecture. Falls back to
// keyword/bigram overlap (below) if Gemini is unavailable, so the demo
// still works end-to-end without any API key.

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const embeddings = require("./embeddings");

const dataset = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/qa_dataset.json"), "utf-8")
);

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "do", "does", "did", "i",
  "you", "he", "she", "it", "we", "they", "to", "for", "of", "in", "on",
  "at", "and", "or", "my", "me", "can", "how", "what", "where", "when",
  "who", "which", "with", "this", "that", "be", "if", "have", "has", "will"
]);

function tokenize(text) {
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  return tokens.filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

// Keyword-overlap retrieval (fallback path — used when no Gemini key is set,
// or if the semantic embeddings call fails for any reason)
function retrieveKeyword(queryEn, domain, k = 3) {
  const queryTokens = new Set(tokenize(queryEn));

  const scored = dataset
    .filter((entry) => domain === null || entry.domain === domain)
    .map((entry) => {
      const entryTokens = tokenize(entry.question_en + " " + entry.answer_en);
      const overlap = entryTokens.filter((t) => queryTokens.has(t)).length;
      return { entry, score: overlap };
    })
    .filter((s) => s.score > 0) // only real matches — a domain having entries doesn't mean any of them are relevant
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((s) => s.entry);
}

// Primary retrieval entry point: tries real semantic search first (accurate,
// understands meaning/paraphrasing/cross-lingual queries), falls back to
// keyword overlap if embeddings aren't available.
async function retrieve(queryEn, domain, k = 3) {
  if (process.env.GEMINI_API_KEY) {
    try {
      const results = await embeddings.semanticRetrieve(queryEn, domain, dataset, k);
      // Only trust semantic matches above a reasonable similarity threshold —
      // below this, the match is likely noise, not real relevance.
      const relevant = results.filter((r) => r.similarityScore >= 0.55);
      if (relevant.length > 0) return relevant;
    } catch (err) {
      console.error(`[rag] semantic retrieval failed, using keyword fallback — ${err.message}`);
    }
  }
  return retrieveKeyword(queryEn, domain, k);
}

const LANGUAGE_NAMES = { en: "English", as: "Assamese", ne: "Nepali", hi: "Hindi" };

// Semantic domain classification — reuses the same embeddings pipeline as
// retrieval (no separate model/infra needed). Instead of keyword-matching
// the query text, this embeds the query and finds which domain the nearest
// dataset entries belong to (majority vote across top-5). This correctly
// classifies queries in any language/phrasing, including cases the
// keyword router misses entirely — e.g. "sar dard" (Hindi for headache)
// has zero English keyword overlap but is semantically close to healthcare
// dataset entries, so this correctly routes it to "healthcare".
async function classifyDomainSemantic(queryEn) {
  if (!process.env.GEMINI_API_KEY) return null; // caller falls back to keyword router

  try {
    const matches = await embeddings.semanticRetrieve(queryEn, null, dataset, 5);
    const relevant = matches.filter((m) => m.similarityScore >= 0.5);
    if (relevant.length === 0) return null;

    const votes = {};
    for (const m of relevant) votes[m.domain] = (votes[m.domain] || 0) + 1;
    const [topDomain, topCount] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];

    return { domain: topDomain, confidence: `semantic (${topCount}/${relevant.length} nearest matches)` };
  } catch (err) {
    console.error(`[rag] semantic domain classification failed — ${err.message}`);
    return null;
  }
}

// Compose final answer using retrieved context + LLM.
// Uses Google Gemini API by default (free tier available at aistudio.google.com).
// Set GEMINI_API_KEY in .env.
//
// KEY DESIGN CHOICE: Gemini is asked to respond DIRECTLY in the target
// language (Assamese/Nepali), instead of generating English then running a
// separate translation pass. This removes one whole external dependency
// (LibreTranslate/Bhashini for the answer leg) and is more reliable since
// Gemini already handles these languages reasonably well for generation.
// Bodo is NOT handled here — it uses native-only retrieval (see
// generateAnswerNative) since Gemini's Bodo support is unreliable/unverified.
async function generateAnswer(queryEn, domain, targetLanguage = "en", history = []) {
  // Multi-turn context: if there's prior conversation, enrich the retrieval
  // query with the last user turn too — so a follow-up like "documents
  // chahiye uske liye?" (which alone has no keywords) still retrieves the
  // right context, because it's searched together with what was just discussed.
  const lastUserTurn = [...history].reverse().find((h) => h.role === "user");
  const retrievalQuery = lastUserTurn ? `${lastUserTurn.text} ${queryEn}` : queryEn;

  const contextEntries = await retrieve(retrievalQuery, domain);

  // Trace data for the "How I got this answer" explainability panel —
  // shows exactly which candidates were considered and how well they
  // matched, so the retrieval isn't a black box to anyone inspecting it.
  const trace = {
    retrievalQuery,
    candidates: contextEntries.map((e) => ({
      question: e.question_en,
      similarityScore: e.similarityScore ?? null // null when keyword fallback was used instead of semantic search
    }))
  };

  const contextText = contextEntries
    .map((e) => `Q: ${e.question_en}\nA: ${e.answer_en}`)
    .join("\n\n");

  const targetLangName = LANGUAGE_NAMES[targetLanguage] || "English";
  const languageInstruction =
    targetLanguage === "en"
      ? ""
      : `\n\nIMPORTANT: Respond ONLY in ${targetLangName}. Do not include English translation or transliteration — native ${targetLangName} script only.`;

  const domainLabel = domain ? domain.replace("_", " ") : "healthcare, governance, education, or rural development";

  const systemPrompt = `You are a helpful assistant for Northeast India citizens, answering questions about ${domainLabel}. Use the reference context below if relevant. Keep answers short (2-4 sentences), clear, and practical. If context doesn't cover the question, answer helpfully from general knowledge but note it's general guidance, not official policy. Do NOT use markdown formatting — no asterisks, no bullet dashes, no headers. Plain sentences only, since the display shows raw text.${languageInstruction}

Reference context:
${contextText || "(no matching reference found)"}`;

  const hasContextMatch = contextEntries.length > 0;
  const topSimilarity = contextEntries[0]?.similarityScore ?? null; // present only when semantic search was used

  if (!process.env.GEMINI_API_KEY) {
    // No API key configured — return the best matching dataset answer directly
    // so the demo still works end-to-end without any keys.
    if (hasContextMatch) {
      return {
        text: contextEntries[0].answer_en + "\n\n[Note: LLM key not configured — showing closest dataset match]",
        source: "dataset_fallback",
        trace
      };
    }
    return {
      text: "I don't have information on that yet. (Set GEMINI_API_KEY in .env to enable full LLM answers.)",
      source: "no_match",
      trace
    };
  }

  // Resilience: on "high demand" / overload errors, retry once, then fall
  // back to a lighter model with separate capacity, before giving up to the
  // dataset fallback. This matters for live demos — a single busy moment on
  // Gemini's free tier shouldn't take the whole system down.
  const modelsToTry = [
    process.env.GEMINI_MODEL || "gemini-2.5-flash",
    "gemini-2.5-flash-lite" // separate capacity pool, lighter/faster
  ];

  async function callGemini(model, attempt = 1) {
    try {
      // Build multi-turn contents: prior turns (if any) + the current query.
      // Capped to the last 3 exchanges — enough for follow-up context
      // without bloating every request with unbounded history.
      const historyContents = history.slice(-6).map((h) => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text }]
      }));

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [...historyContents, { role: "user", parts: [{ text: queryEn }] }],
          generationConfig: { maxOutputTokens: 300, temperature: 0.4 }
        },
        { headers: { "content-type": "application/json" }, timeout: 15000 }
      );
      return response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (err) {
      const message = err.response?.data?.error?.message || err.message;
      const isOverloaded = /high demand|overloaded|503/i.test(message);
      if (isOverloaded && attempt === 1) {
        await new Promise((r) => setTimeout(r, 800)); // brief backoff, then one retry on the same model
        return callGemini(model, 2);
      }
      throw err; // let the caller try the next model in modelsToTry, or give up
    }
  }

  try {
    let text = null;
    let lastErr = null;
    for (const model of modelsToTry) {
      try {
        text = await callGemini(model);
        if (text) break;
      } catch (err) {
        lastErr = err;
        console.error(`[rag] ${model} failed, trying next fallback — ${err.response?.data?.error?.message || err.message}`);
      }
    }
    if (!text) throw lastErr || new Error("All models failed");

    return {
      text: text.trim(),
      source: hasContextMatch ? "dataset_grounded" : "ai_general_knowledge",
      similarityScore: topSimilarity,
      trace
    };
  } catch (err) {
    console.error(`[rag] Gemini call failed — ${err.response?.data?.error?.message || err.message}`);
    if (hasContextMatch) {
      return {
        text: contextEntries[0].answer_en + "\n\n[Note: LLM call failed — showing closest dataset match]",
        source: "dataset_fallback",
        trace
      };
    }
    return { text: "Sorry, something went wrong generating the answer.", source: "error", trace };
  }
}

// Native-language retrieval — used for low-resource dialects (e.g. Bodo)
// where we deliberately skip MT. Matches the user's native-script query
// directly against curated question_native / answer_native pairs. This is
// retrieval-only (no LLM step) since we have no reliable way to translate
// a low-resource language into English for the LLM prompt.
function retrieveNative(queryNative, domain, language, k = 1) {
  // Character-bigram overlap works better than word-tokenizing for
  // Indic scripts without clean whitespace-delimited word boundaries.
  function bigrams(str) {
    const clean = str.replace(/\s+/g, "");
    const grams = [];
    for (let i = 0; i < clean.length - 1; i++) grams.push(clean.slice(i, i + 2));
    return grams;
  }

  const queryGrams = bigrams(queryNative);

  const scored = dataset
    .filter((e) => e.domain === domain && e.language === language)
    .map((entry) => {
      const entryGrams = bigrams(entry.question_native);
      const overlap = entryGrams.filter((g) => queryGrams.includes(g)).length;
      return { entry, score: overlap };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, k).map((s) => s.entry);
}

async function generateAnswerNative(queryNative, domain, language) {
  const matches = retrieveNative(queryNative, domain, language);
  if (matches.length === 0 || matches[0].score < 2) {
    return {
      answer_native: null,
      answer_en:
        "No confident match found for this low-resource language yet — this grows as more native speakers contribute Q&A pairs.",
      matched: false
    };
  }
  return {
    answer_native: matches[0].answer_native,
    answer_en: matches[0].answer_en,
    matched: true
  };
}

module.exports = { retrieve, generateAnswer, retrieveNative, generateAnswerNative, classifyDomainSemantic };

// ---- Scaling notes for the team ----
// 1. Replace keyword retrieve() with real embeddings (e.g. OpenAI/Gemini
//    embeddings + Pinecone or Chroma) once dataset grows past ~200 entries.
// 2. Add per-domain vector namespaces so retrieval doesn't cross-contaminate.
// 3. For NE-language-native retrieval (not just English), embed question_native
//    too and search in both languages.
